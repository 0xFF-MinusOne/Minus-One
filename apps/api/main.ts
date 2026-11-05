import {Hono} from 'hono';
import {cors} from 'hono/cors';
import {bodyLimit} from 'hono/body-limit';
import {createClient} from '@supabase/supabase-js';
import {createHash,createHmac,randomUUID} from 'node:crypto';
import {inScope,type ScopeRule} from './scope';
export interface GatewayConfig{url:string;anonKey:string;engineUrl:string;secret:string;webOrigin?:string}
export function createGateway(config:GatewayConfig){
 const app=new Hono();
 app.use('*',cors({origin:config.webOrigin||'',allowHeaders:['Authorization','Content-Type','X-Project-Id'],allowMethods:['GET','POST','OPTIONS']}));
 app.use('*',bodyLimit({maxSize:65536,onError:c=>c.json({detail:'リクエストが大きすぎます'},413)}));
 app.get('/api/recon/health',c=>c.json({gateway:'ok',engine_configured:Boolean(config.engineUrl&&config.secret)}));
 app.all('/api/recon/*',async c=>{
   if(!config.url||!config.anonKey||!config.engineUrl||config.secret.length<32)return c.json({detail:'Recon APIの接続設定が未完了です'},503);
   const bearer=c.req.header('Authorization');if(!bearer?.startsWith('Bearer '))return c.json({detail:'ログインが必要です'},401);
   const project=c.req.header('X-Project-Id');if(!project||!/^[\da-f]{8}-([\da-f]{4}-){3}[\da-f]{12}$/i.test(project))return c.json({detail:'案件を指定してください'},400);
   const supabase=createClient(config.url,config.anonKey,{global:{headers:{Authorization:bearer}},auth:{persistSession:false,autoRefreshToken:false}});
   const {data:claims,error}=await supabase.auth.getClaims(bearer.slice(7));
   if(error||!claims?.claims||claims.claims.aal!=='aal2')return c.json({detail:'ログインと二段階認証が必要です'},401);
   const user=claims.claims.sub;
   const [member,access]=await Promise.all([supabase.from('members').select('is_active').eq('user_id',user).single(),supabase.from('recon_project_access').select('role,organization_id').eq('project_id',project).eq('user_id',user).single()]);
   if(member.error||!member.data?.is_active||access.error||!access.data)return c.json({detail:'この案件にアクセスできません'},403);
   if(c.req.method!=='GET'&&!['researcher','admin'].includes(access.data.role))return c.json({detail:'調査の実行権限がありません'},403);
   const suffix=c.req.path.slice('/api/recon'.length);const allowed=/^\/(scans(?:\/[\da-f-]+(?:\/(?:cancel|retry))?)?|agents\/runs(?:\/[\da-f-]+(?:\/(?:approve|cancel))?)?|assets|fingerprints|vulnerabilities|intelligence|benchmark(?:\/answers)?|evidence|audit|providers(?:\/(?:anthropic|openai|ollama|chatgpt)\/(?:test|disconnect))?)$/;
   if(!allowed.test(suffix)||!['GET','POST'].includes(c.req.method))return c.json({detail:'APIが見つかりません'},404);
   const body=c.req.method==='GET'?'':await c.req.text();
   if(c.req.method==='POST'&&suffix==='/scans'){
     let payload:Record<string,unknown>;try{payload=JSON.parse(body)}catch{return c.json({detail:'JSON形式が正しくありません'},400)}
     const scope=await supabase.from('recon_scopes').select('kind,value,excluded,authorization').eq('project_id',project);
     try{if(scope.error||typeof payload.target!=='string'||payload.authorization_confirmed!==true||!inScope(payload.target,scope.data as ScopeRule[]||[]))return c.json({detail:'診断範囲と許可確認が必要です'},403)}catch{return c.json({detail:'対象の形式が正しくありません'},400)}
   }
   const path='/api/v1'+suffix;const assertion={user_id:user,project_id:project,organization_id:access.data.organization_id,aal:'aal2',iat:Math.floor(Date.now()/1000),nonce:randomUUID(),method:c.req.method,path,body_sha256:createHash('sha256').update(body).digest('hex')};
   const encoded=Buffer.from(JSON.stringify(assertion)).toString('base64url');const signature=createHmac('sha256',config.secret).update(encoded).digest('base64url');
   try{
     const response=await fetch(new URL(path,config.engineUrl),{method:c.req.method,headers:{'Content-Type':'application/json','X-Recon-Assertion':encoded+'.'+signature},body:body||undefined,signal:AbortSignal.timeout(25000),redirect:'error'});
     return new Response(response.body,{status:response.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
   }catch{return c.json({detail:'Python Engineに接続できません。接続先と起動状態を確認してください'},502)}
 });return app;
}
export const gateway=createGateway({url:process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL||'',anonKey:process.env.SUPABASE_ANON_KEY||process.env.VITE_SUPABASE_ANON_KEY||'',engineUrl:process.env.RECON_ENGINE_URL||'',secret:process.env.RECON_SERVICE_SECRET||'',webOrigin:process.env.WEB_ORIGIN});
