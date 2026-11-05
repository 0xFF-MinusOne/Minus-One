import asyncio,json,hashlib
from dataclasses import asdict
from sqlalchemy import select,text
from ..db import sessions,EngineRun,project_context,audit
from ..security.policy import ScopeRule,ScopePolicy,canonical_target
from ..security.redact import redact
from ..scanners import REGISTRY
from ..scanners.base import ProcessResult,Observation
from ..intelligence.client import Intelligence
from ..providers.vault import Vault
from ..config import settings
from ..agents.harness import research
async def update_run(run_id,status,state):
    async with sessions()() as s:
        await s.execute(text('update recon_engine_runs set status=:status,state=cast(:state as jsonb),updated_at=now() where id=:id'),{'id':run_id,'status':status,'state':json.dumps(state,default=str)});await s.commit()
async def execute(ctx,run_id:str,stage:str='plan'):
    async with sessions()() as s:
        run=await s.get(EngineRun,run_id)
        if not run or run.cancel_requested or run.status in ('completed','cancelled'):return
    try:rules=await project_context(run.project_id,run.user_id,True)
    except PermissionError:
        await update_run(run_id,'blocked',{'error':'案件の実行権限がありません'});return
    lock='recon:project-lock:'+str(run.project_id)
    if not await ctx['redis'].set(lock,run_id,nx=True,ex=settings.timeout+60):
        from arq import Retry
        raise Retry(defer=5)
    cancel=asyncio.Event();poll_task=None
    async def poll():
        while not cancel.is_set():
            await asyncio.sleep(.5)
            async with sessions()() as s:
                fresh=await s.get(EngineRun,run_id)
                if not fresh or fresh.cancel_requested:cancel.set()
    try:
        async with sessions()() as s:
            fresh=await s.get(EngineRun,run_id)
            if fresh.cancel_requested:await update_run(run_id,'cancelled',fresh.state);return
            if stage=='analyze' and (not fresh.state.get('approval') or fresh.state.get('approval',{}).get('plan_hash')!=fresh.state.get('plan_hash')):raise PermissionError('調査計画の承認が必要です')
        await update_run(run_id,'running',run.state);await audit(run.project_id,run.user_id,run.id,'run.started',{'stage':stage})
        poll_task=asyncio.create_task(poll())
        if run.kind=='research':
            operation=asyncio.create_task(research(run,stage));stopped=asyncio.create_task(cancel.wait())
            try:
                done,_=await asyncio.wait([operation,stopped],timeout=90,return_when=asyncio.FIRST_COMPLETED)
                if operation not in done:raise asyncio.CancelledError() if cancel.is_set() else TimeoutError()
                state=await operation
                await update_run(run_id,'awaiting_approval' if stage=='plan' else 'completed',{**run.state,**state})
            finally:
                for t in (operation,stopped):
                    if not t.done():t.cancel()
                await asyncio.gather(operation,stopped,return_exceptions=True)
        else:
            tool=run.payload['tool'];target=run.payload['target']
            policy=ScopePolicy([ScopeRule(**r) for r in rules]);policy.require(target)
            if tool=='osv':
                lookup=await Intelligence().osv(run.payload['purl'],run.payload['version'])
                for vulnerability in lookup['raw'].get('vulns',[])[:30]:
                    ids=[vulnerability.get('id','')]+vulnerability.get('aliases',[])
                    import re
                    for cve in ids:
                        if re.fullmatch(r'CVE-\d{4}-\d{4,19}',cve):
                            try:
                                lookup.setdefault('official_advisories',[]).append(await Intelligence().advisory(cve))
                                lookup.setdefault('exploitation',[]).append(await Intelligence().kev(cve))
                            except Exception:lookup.setdefault('warnings',[]).append(cve+'の外部情報を取得できませんでした')
                            break
                result=ProcessResult(json.dumps(lookup),'',0,'OSV API v1')
                observation=Observation(target,'OSV',result.version,'advisory',lookup,'database_match')
                evidence_id=await save_evidence(run,result,[observation],{'purl':run.payload['purl'],'version':run.payload['version']})
                await update_run(run_id,'completed',{'evidence_id':evidence_id,'verification':'Potentially Affected','progress':100})
                return
            if tool!='subfinder':
                if not settings.active_scans:raise PermissionError('アクティブスキャンは管理者設定で無効です')
                _,literal,_=canonical_target(target)
                if not literal:raise PermissionError('DNS再解決による範囲逸脱を防ぐため、登録したIPを指定してください')
                await policy.resolved(target)
            adapter=REGISTRY[tool]()
            if tool=='nuclei':adapter.manifest=settings.approved_templates
            options=dict(run.payload.get('options',{}));pins={'subfinder':'2.17.0','httpx':'1.12.0','nuclei':'3.11.1'}
            if tool in pins:options['_expected_version']=pins[tool]
            result=await adapter.execute(target,options,timeout=settings.timeout,limit=settings.max_output_bytes,cancel=cancel)
            try:observations=adapter.normalize(result,target) if result.exit_code==0 else []
            except Exception:
                evidence_id=await save_evidence(run,result,[],options)
                run.state={**run.state,'evidence_id':evidence_id}
                raise ValueError('ツールの出力を解析できませんでした。元の出力は証跡に保存しました')
            observations=[o for o in observations if policy.allows(o.target)]
            evidence_id=await save_evidence(run,result,observations,options)
            state={'evidence_id':evidence_id,'exit_code':result.exit_code,'observations':len(observations),'progress':100,**({'verification':'Potentially Affected' if observations else 'Inconclusive'} if tool=='nuclei' else {})}
            await update_run(run_id,'completed' if result.exit_code==0 else 'failed',state)
        await audit(run.project_id,run.user_id,run.id,'run.finished',{'stage':stage})
    except asyncio.CancelledError:
        await update_run(run_id,'cancelled',{**run.state,'message':'ユーザーが停止しました'});await audit(run.project_id,run.user_id,run.id,'run.cancelled',{})
    except BaseException as e:
        message=str(e) if isinstance(e,(PermissionError,ValueError,TimeoutError,RuntimeError)) else '内部処理に失敗しました。設定とログを確認してください'
        await update_run(run_id,'failed',{**run.state,'error':redact(message)[:1000]});await audit(run.project_id,run.user_id,run.id,'run.failed',{'error_type':type(e).__name__})
    finally:
        if poll_task:poll_task.cancel();await asyncio.gather(poll_task,return_exceptions=True)
        await ctx['redis'].eval("if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end",1,lock,run_id)
async def save_evidence(run,result,observations,options):
    raw=json.dumps({'stdout':result.stdout,'stderr':result.stderr});encrypted=Vault(settings.encryption_key).encrypt({'stdout':result.stdout,'stderr':result.stderr})
    async with sessions()() as s:
        evidence_id=(await s.execute(text('insert into recon_evidence(project_id,run_id,tool,tool_version,target,raw_encrypted,raw_sha256,redacted_output,normalized,exit_code,config) values(:p,:r,:t,:v,:target,:raw,:sha,:red,cast(:normalized as jsonb),:code,cast(:config as jsonb)) returning id'),{'p':run.project_id,'r':run.id,'t':run.payload['tool'],'v':result.version,'target':run.payload['target'],'raw':encrypted,'sha':hashlib.sha256(raw.encode()).hexdigest(),'red':redact(raw),'normalized':json.dumps([asdict(o) for o in observations]),'code':result.exit_code,'config':json.dumps(options)})).scalar_one()
        # Preserve every observation in evidence, but only merge asset identity here. Contradictory versions are not collapsed.
        for o in observations:
            host,ip,_=canonical_target(o.target)
            await s.execute(text("insert into recon_assets(project_id,host,type,status,risk,source) values(:p,:h,:t,:status,'Unknown',:source) on conflict(project_id,host) do update set last_seen_at=now()"),{'p':run.project_id,'h':host,'t':'IP' if ip else 'Host','status':'Unknown','source':o.source_tool})
            asset=(await s.execute(text('select id from recon_assets where project_id=:p and host=:h'),{'p':run.project_id,'h':host})).scalar_one()
            n=o.normalized
            if o.kind=='service':
                await s.execute(text('insert into recon_services(project_id,asset_id,port,transport,protocol,banner,state) values(:p,:a,:port,:t,:protocol,:banner,:state) on conflict(asset_id,port,transport) do update set protocol=excluded.protocol,banner=excluded.banner,state=excluded.state'),{'p':run.project_id,'a':asset,'port':n['port'],'t':n['transport'],'protocol':n.get('name') or '', 'banner':' '.join(filter(None,[n.get('product'),n.get('version')])),'state':n['state'] if n['state'] in ('open','closed') else 'unknown'})
                if n.get('product'):
                    await s.execute(text('insert into recon_technologies(project_id,asset_id,name,version,evidence) values(:p,:a,:name,:v,:e) on conflict(asset_id,name) do update set version=excluded.version,evidence=excluded.evidence'),{'p':run.project_id,'a':asset,'name':n['product'],'v':n.get('version') or '', 'e':str(evidence_id)})
            elif o.kind=='fingerprint':
                from urllib.parse import urlsplit
                u=urlsplit(n.get('url',o.target));port=u.port or (443 if u.scheme=='https' else 80)
                if n.get('status_code'):
                    await s.execute(text("update recon_assets set status='Live' where id=:id"),{'id':asset})
                    await s.execute(text("insert into recon_services(project_id,asset_id,port,transport,protocol,banner,state) values(:p,:a,:port,'tcp',:protocol,:banner,'open') on conflict(asset_id,port,transport) do update set protocol=excluded.protocol,banner=excluded.banner,state=excluded.state"),{'p':run.project_id,'a':asset,'port':port,'protocol':u.scheme,'banner':n.get('server') or ''})
                for name in n.get('technologies',[]):
                    await s.execute(text('insert into recon_technologies(project_id,asset_id,name,version,evidence) values(:p,:a,:name,:version,:e) on conflict(asset_id,name) do update set evidence=excluded.evidence'),{'p':run.project_id,'a':asset,'name':str(name)[:200],'version':'','e':str(evidence_id)})
        await s.commit();return str(evidence_id)
