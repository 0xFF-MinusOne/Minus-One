from contextlib import asynccontextmanager
from dataclasses import asdict
from pathlib import Path
from uuid import UUID
import json,secrets,time
from fastapi import FastAPI,Request,Depends,HTTPException
from sqlalchemy import select,text
from arq import create_pool
from arq.connections import RedisSettings
from .config import settings
from .db import sessions,EngineRun,rows,project_context,audit
from .security.service_auth import verify_assertion
from .security.policy import ScopePolicy,ScopeRule
from .schemas import ScanRequest,AgentRequest,RunView,ProviderSettings,Approval
from .providers import make_provider
from .providers.vault import Vault
from .intelligence.client import Intelligence
@asynccontextmanager
async def lifespan(app):
    app.state.redis=await create_pool(RedisSettings.from_dsn(settings.redis_url))
    yield
    await app.state.redis.aclose()
app=FastAPI(title='Minus One Recon Engine',version='0.1.0',lifespan=lifespan,docs_url=None,redoc_url=None)
@app.exception_handler(PermissionError)
async def permission_error(request,exc):return __import__('fastapi').responses.JSONResponse(status_code=403,content={'detail':str(exc)})
@app.exception_handler(ValueError)
async def value_error(request,exc):return __import__('fastapi').responses.JSONResponse(status_code=400,content={'detail':str(exc)})
async def context(request:Request):
    body=await request.body()
    if len(body)>65536:raise HTTPException(413,'リクエストが大きすぎます')
    path=request.url.path+('?' + request.url.query if request.url.query else '')
    c=verify_assertion(request.headers.get('x-recon-assertion',''),settings.service_secret,request.method,path,body)
    if not await request.app.state.redis.set('assertion:'+c['nonce'],'1',nx=True,ex=70):raise HTTPException(401,'サービス認証の再利用はできません')
    await project_context(c['project_id'],c['user_id'],request.method not in ('GET','HEAD'))
    ratekey=f"rate:{c['user_id']}:{int(time.time()//60)}"
    count=await request.app.state.redis.incr(ratekey)
    if count==1:await request.app.state.redis.expire(ratekey,65)
    if count>100:raise HTTPException(429,'リクエスト上限です')
    return c
@app.get('/health')
async def health():return {'status':'ok','active_scans_enabled':settings.active_scans,'deployment':settings.deployment}
async def get_run(run_id,c):
    found=await rows('select * from recon_engine_runs where id=:id and project_id=:p',{'id':run_id,'p':c['project_id']})
    if not found:raise HTTPException(404,'ジョブが見つかりません')
    return found[0]
async def create_run(kind,payload,c,request):
    key=str(payload.pop('idempotency_key'))
    async with sessions()() as s:
        q=text("insert into recon_engine_runs(project_id,user_id,kind,idempotency_key,payload,state) values(:p,:u,:kind,:k,cast(:body as jsonb),'{}') on conflict(project_id,user_id,idempotency_key) do nothing returning id")
        rid=(await s.execute(q,{'p':c['project_id'],'u':c['user_id'],'kind':kind,'k':key,'body':json.dumps(payload)})).scalar_one_or_none()
        if not rid:
            old=(await s.execute(select(EngineRun).where(EngineRun.project_id==UUID(c['project_id']),EngineRun.user_id==UUID(c['user_id']),EngineRun.idempotency_key==key))).scalar_one()
            if old.kind!=kind or old.payload!=payload:raise HTTPException(409,'同じキーで異なる処理は登録できません')
            return RunView.model_validate(old)
        await s.commit()
    await audit(c['project_id'],c['user_id'],rid,'run.created',{'kind':kind})
    try:await request.app.state.redis.enqueue_job('execute',str(rid),'plan',_job_id=str(rid)+':plan')
    except Exception:
        from .workers.executor import update_run
        await update_run(rid,'blocked',{'error':'キューへ登録できませんでした。再試行してください。'})
        raise HTTPException(503,'キューへ登録できませんでした。履歴から再試行できます。')
    return await get_run(rid,c)
@app.post('/api/v1/scans',response_model=RunView)
async def scans(body:ScanRequest,request:Request,c=Depends(context)):
    policy=ScopePolicy([ScopeRule(**r) for r in await project_context(c['project_id'],c['user_id'],True)])
    policy.require(body.target)
    if body.tool!='subfinder':
        if not settings.active_scans:raise HTTPException(403,'アクティブスキャンは管理者設定で無効です')
        from .security.policy import canonical_target
        if not canonical_target(body.target)[1]:raise HTTPException(400,'DNSによるScope逸脱を防ぐため、明示的に登録したIPを指定してください')
        await policy.resolved(body.target)
    return await create_run('scan',body.model_dump(mode='json'),c,request)
@app.get('/api/v1/scans',response_model=list[RunView])
async def list_scans(c=Depends(context)):return await rows("select * from recon_engine_runs where project_id=:p and kind='scan' order by created_at desc limit 100",{'p':c['project_id']})
@app.get('/api/v1/scans/{run_id}',response_model=RunView)
async def scan_status(run_id:UUID,c=Depends(context)):return await get_run(run_id,c)
@app.post('/api/v1/scans/{run_id}/cancel')
@app.post('/api/v1/agents/runs/{run_id}/cancel')
async def cancel_run(run_id:UUID,c=Depends(context)):
    run=await get_run(run_id,c)
    if str(run['user_id'])!=c['user_id']:raise HTTPException(403,'実行者のみ停止できます')
    async with sessions()() as s:
        await s.execute(text("update recon_engine_runs set cancel_requested=true,status=case when status in ('queued','awaiting_approval','blocked') then 'cancelled' else status end where id=:id and status not in ('completed','failed','cancelled')"),{'id':run_id});await s.commit()
    await audit(c['project_id'],c['user_id'],run_id,'run.cancel_requested',{});return {'status':'cancel_requested'}
@app.post('/api/v1/scans/{run_id}/retry',response_model=RunView)
async def retry_scan(run_id:UUID,request:Request,c=Depends(context)):
    old=await get_run(run_id,c)
    if old['kind']!='scan' or str(old['user_id'])!=c['user_id'] or old['status'] not in ('failed','cancelled','blocked'):raise HTTPException(409,'このジョブは再試行できません')
    payload={**old['payload'],'idempotency_key':str(__import__('uuid').uuid4())};body=ScanRequest.model_validate(payload)
    return await scans(body,request,c)
@app.get('/api/v1/assets')
async def assets(c=Depends(context)):return await rows('select * from recon_assets where project_id=:p order by host',{'p':c['project_id']})
@app.get('/api/v1/fingerprints')
@app.get('/api/v1/vulnerabilities')
async def fingerprints(request:Request,c=Depends(context)):
    data=await rows('select id,tool,tool_version,target,normalized,created_at from recon_evidence where project_id=:p order by created_at desc limit 100',{'p':c['project_id']})
    kinds={'fingerprint','service'} if request.url.path.endswith('fingerprints') else {'vulnerability','advisory'}
    return [{'evidence_id':str(e['id']),**o} for e in data for o in e['normalized'] if o.get('kind') in kinds]
@app.get('/api/v1/evidence')
async def evidence(c=Depends(context)):return await rows('select id,tool,tool_version,target,raw_sha256,redacted_output,normalized,exit_code,config,created_at from recon_evidence where project_id=:p order by created_at desc limit 100',{'p':c['project_id']})
@app.get('/api/v1/audit')
async def audit_log(c=Depends(context)):return await rows('select id,action,payload,created_at,run_id from recon_audit where project_id=:p order by created_at desc limit 200',{'p':c['project_id']})
@app.post('/api/v1/agents/runs',response_model=RunView)
async def agents(body:AgentRequest,request:Request,c=Depends(context)):
    if not body.objective.strip():raise HTTPException(400,'調査目的を入力してください')
    return await create_run('research',body.model_dump(mode='json'),c,request)
@app.get('/api/v1/agents/runs',response_model=list[RunView])
async def agent_runs(c=Depends(context)):return await rows("select * from recon_engine_runs where project_id=:p and user_id=:u and kind='research' order by created_at desc limit 100",{'p':c['project_id'],'u':c['user_id']})
@app.get('/api/v1/agents/runs/{run_id}',response_model=RunView)
async def agent_status(run_id:UUID,c=Depends(context)):return await get_run(run_id,c)
@app.post('/api/v1/agents/runs/{run_id}/approve')
async def approve(run_id:UUID,body:Approval,request:Request,c=Depends(context)):
    async with sessions()() as s:
        run=(await s.execute(select(EngineRun).where(EngineRun.id==run_id,EngineRun.project_id==UUID(c['project_id'])).with_for_update())).scalar_one_or_none()
        if not run or str(run.user_id)!=c['user_id']:raise HTTPException(404,'調査が見つかりません')
        if run.status!='awaiting_approval' or run.state.get('plan_hash')!=body.plan_hash:raise HTTPException(409,'承認対象の計画が変更されています')
        run.state={**run.state,'approval':{'user_id':c['user_id'],'plan_hash':body.plan_hash,'approved_at':time.time()}};run.status='queued';await s.commit()
    await audit(c['project_id'],c['user_id'],run_id,'research.approved',{'plan_hash':body.plan_hash})
    await request.app.state.redis.enqueue_job('execute',str(run_id),'analyze',_job_id=str(run_id)+':analyze')
    return {'status':'queued','message':'承認した計画に基づき既存証跡を分析します。外部スキャンは実行しません。'}
@app.get('/api/v1/providers')
async def providers(c=Depends(context)):
    saved=await rows('select id,provider,model,monthly_budget,input_rate,output_rate,auto_stop,enabled from recon_ai_connections where user_id=:u',{'u':c['user_id']})
    usage=await rows("select c.provider,sum(u.input_tokens) as input_tokens,sum(u.output_tokens) as output_tokens,sum(u.estimated_cost) as estimated_cost,count(*) filter(where u.status='unknown') as unknown from recon_ai_usage u join recon_ai_connections c on c.id=u.connection_id where c.user_id=:u and u.created_at>=date_trunc('month',now()) group by c.provider",{'u':c['user_id']})
    return [{'provider':p,'configured':bool(next((s for s in saved if s['provider']==p and s['enabled']),None)),'settings':next((s for s in saved if s['provider']==p),None),'usage':next((s for s in usage if s['provider']==p),None),'balance':None,'available':p!='chatgpt' or settings.deployment=='local','reason':'共有Web版では未対応です。ローカル版またはAPI方式を利用してください' if p=='chatgpt' and settings.deployment!='local' else ''} for p in ('anthropic','openai','ollama','chatgpt')]
@app.post('/api/v1/providers')
async def configure_provider(body:ProviderSettings,c=Depends(context)):
    if body.provider=='chatgpt' and settings.deployment!='local':raise HTTPException(400,'共有Web版ではChatGPT利用枠への接続は未対応です')
    old=await rows('select * from recon_ai_connections where user_id=:u and provider=:p',{'u':c['user_id'],'p':body.provider})
    vault=Vault(settings.encryption_key)
    if body.provider=='chatgpt':
        local=Path(settings.credential_dir)/'chatgpt.json'
        if not local.exists():raise HTTPException(400,'ローカルのrecon-chatgpt-signinでサインインしてください')
        credentials=vault.decrypt(json.loads(local.read_text())['encrypted'])
    elif body.provider=='ollama':credentials={}
    elif body.api_key:credentials={'api_key':body.api_key}
    elif old and old[0]['enabled']:credentials=vault.decrypt(old[0]['encrypted_credentials'])
    else:raise HTTPException(400,'APIキーを入力してください')
    async with sessions()() as s:
        await s.execute(text('insert into recon_ai_connections(user_id,provider,encrypted_credentials,model,monthly_budget,input_rate,output_rate,auto_stop) values(:u,:p,:cred,:m,:b,:i,:o,:a) on conflict(user_id,provider) do update set encrypted_credentials=excluded.encrypted_credentials,model=excluded.model,monthly_budget=excluded.monthly_budget,input_rate=excluded.input_rate,output_rate=excluded.output_rate,auto_stop=excluded.auto_stop,enabled=true'),{'u':c['user_id'],'p':body.provider,'cred':vault.encrypt(credentials),'m':body.model,'b':body.monthly_budget,'i':body.input_rate,'o':body.output_rate,'a':body.auto_stop});await s.commit()
    await audit(c['project_id'],c['user_id'],None,'provider.configured',{'provider':body.provider});return {'status':'saved'}
@app.post('/api/v1/providers/{name}/disconnect')
async def disconnect(name:str,c=Depends(context)):
    async with sessions()() as s:
        await s.execute(text("update recon_ai_connections set enabled=false,encrypted_credentials='' where user_id=:u and provider=:p"),{'u':c['user_id'],'p':name});await s.commit()
    return {'status':'disconnected'}
@app.get('/api/v1/providers/{name}/test')
async def test_provider(name:str,c=Depends(context)):
    found=await rows('select * from recon_ai_connections where user_id=:u and provider=:p and enabled',{'u':c['user_id'],'p':name})
    if not found:raise HTTPException(404,'Providerが未接続です')
    v=found[0];credentials=Vault(settings.encryption_key).decrypt(v['encrypted_credentials'])
    return await make_provider(name,v['model'],credentials).health_check()

def benchmark_catalog():
    import os
    path=Path(os.getenv('BENCHMARK_DATA_PATH','/data/benchmark-5.1.json'))
    if not path.exists():raise HTTPException(503,'提供されたbenchmark.zipをローカルの取り込みスクリプトで設定してください')
    return json.loads(path.read_text())
@app.get('/api/v1/benchmark')
async def benchmark(c=Depends(context)):
    catalog=benchmark_catalog();answers=await rows('select item_id,score,rationale,evidence_ids,updated_at from recon_benchmark_answers where project_id=:p and catalog_sha=:sha',{'p':c['project_id'],'sha':catalog['sha256']})
    return [{'catalog':catalog,'answers':answers,'answered':len(answers),'simple_total':sum(a['score'] for a in answers),'complete':len(answers)==len(catalog['items'])}]
from .schemas import BenchmarkAnswer
@app.post('/api/v1/benchmark/answers')
async def benchmark_answer(body:BenchmarkAnswer,c=Depends(context)):
    catalog=benchmark_catalog()
    if body.item_id not in [i['id'] for i in catalog['items']]:raise HTTPException(400,'設問が存在しません')
    for eid in body.evidence_ids:
        if not await rows('select id from recon_evidence where id=:id and project_id=:p',{'id':eid,'p':c['project_id']}):raise HTTPException(400,'別案件または存在しない証跡です')
    async with sessions()() as s:
        await s.execute(text('insert into recon_benchmark_answers(project_id,catalog_sha,item_id,score,rationale,evidence_ids,updated_by) values(:p,:sha,:i,:score,:r,:e,:u) on conflict(project_id,catalog_sha,item_id) do update set score=excluded.score,rationale=excluded.rationale,evidence_ids=excluded.evidence_ids,updated_by=excluded.updated_by,updated_at=now()'),{'p':c['project_id'],'sha':catalog['sha256'],'i':body.item_id,'score':body.score,'r':body.rationale,'e':body.evidence_ids,'u':c['user_id']});await s.commit()
    await audit(c['project_id'],c['user_id'],None,'benchmark.answered',{'item_id':body.item_id,'catalog_sha':catalog['sha256']});return {'status':'saved'}
from .schemas import LookupRequest
@app.post('/api/v1/intelligence',response_model=RunView)
async def lookup(body:LookupRequest,request:Request,c=Depends(context)):
    found=await rows('select host from recon_assets where project_id=:p and id=:id',{'p':c['project_id'],'id':body.asset_id})
    if not found:raise HTTPException(404,'対象資産が見つかりません')
    payload=body.model_dump(mode='json');payload.update({'tool':'osv','target':found[0]['host'],'workflow':'intelligence'})
    return await create_run('scan',payload,c,request)
