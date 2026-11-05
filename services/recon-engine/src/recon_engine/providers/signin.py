"""Official, local-only ChatGPT PKCE sign-in. Never reads Codex/Claude credentials."""
import base64,hashlib,json,secrets,time,uuid,webbrowser,os
from pathlib import Path
from urllib.parse import urlencode,urlsplit,parse_qs
from http.server import BaseHTTPRequestHandler,HTTPServer
from .vault import atomic_private_json,Vault
AUTH='https://auth.openai.com/api/accounts/authorize'
TOKEN='https://auth.openai.com/api/accounts/oauth/token'
RESOURCE='https://api.openai.com/v1'
SCOPES='openid profile email offline_access resource.invoke chatgpt.tokens.use.direct'
def authorization_request(host_id:str,redirect:str,client_id:str='dynamic_agent_client'):
    verifier=secrets.token_urlsafe(64);state=secrets.token_urlsafe(32);nonce=secrets.token_urlsafe(32)
    params={'client_id':client_id,'ext_agent_host_id':host_id,'redirect_uri':redirect,'response_type':'code','scope':SCOPES,'resource':RESOURCE,'state':state,'nonce':nonce,'code_challenge_method':'S256','code_challenge':base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')}
    if client_id=='dynamic_agent_client':params['agent_name_hint']='Minus One Recon'
    return AUTH+'?'+urlencode(params),{'verifier':verifier,'state':state,'nonce':nonce,'redirect':redirect,'client_id':client_id,'host_id':host_id,'created_at':time.time()}
def validate_callback(query:dict,pending:dict)->str:
    if time.time()-pending['created_at']>300 or not secrets.compare_digest(query.get('state',''),pending['state']):raise ValueError('OAuth stateまたは有効期限が一致しません')
    if query.get('error'):raise ValueError('ChatGPTサインインが承認されませんでした')
    issued=query.get('client_id',pending['client_id'])
    if issued=='dynamic_agent_client' or not issued or (pending['client_id']!='dynamic_agent_client' and issued!=pending['client_id']):raise ValueError('発行クライアントIDが一致しません')
    if not query.get('code'):raise ValueError('認可コードがありません')
    return issued
async def exchange(query,pending,client):
    issued=validate_callback(query,pending)
    response=await client.post(TOKEN,data={'grant_type':'authorization_code','client_id':issued,'code':query['code'],'code_verifier':pending['verifier'],'redirect_uri':pending['redirect'],'resource':RESOURCE});response.raise_for_status();tokens=response.json()
    config=(await client.get('https://auth.openai.com/.well-known/openid-configuration')).json()
    if config.get('issuer')!='https://auth.openai.com' or urlsplit(config['jwks_uri']).hostname!='auth.openai.com':raise ValueError('OIDCの発行者が一致しません')
    jwks_response=await client.get(config['jwks_uri']);jwks_response.raise_for_status()
    import jwt
    header=jwt.get_unverified_header(tokens['id_token'])
    keys=[k for k in jwks_response.json()['keys'] if k.get('kid')==header.get('kid') and k.get('kty')=='RSA']
    if len(keys)!=1 or header.get('alg')!='RS256':raise ValueError('ID Tokenの署名キーが一致しません')
    claims=jwt.decode(tokens['id_token'],jwt.PyJWK.from_dict(keys[0]).key,algorithms=['RS256'],issuer='https://auth.openai.com',audience=issued,options={'require':['exp','iss','aud','sub','nonce']})
    if not secrets.compare_digest(claims['nonce'],pending['nonce']):raise ValueError('OIDC nonceが一致しません')
    scopes=tokens.get('scope','').split()
    if not {'resource.invoke','chatgpt.tokens.use.direct'}.issubset(scopes):raise ValueError('ChatGPT利用枠の権限が付与されていません')
    return {**tokens,'client_id':issued,'subject':claims['sub'],'email':claims.get('email'),'ext_agent_host_id':pending['host_id'],'scopes':scopes,'saved_at':time.time(),'expires_at':time.time()+tokens['expires_in']}
async def refresh(record,client):
    if time.time()<record.get('expires_at',0)-60:return record
    if time.time()<record.get('earliest_refresh_at',0):raise ValueError('再発行可能な時刻まで待機してください')
    r=await client.post(TOKEN,data={'grant_type':'refresh_token','client_id':record['client_id'],'refresh_token':record['refresh_token'],'resource':RESOURCE});r.raise_for_status();v=r.json()
    return {**record,**v,'expires_at':time.time()+v['expires_in'],'saved_at':time.time(),'scopes':v.get('scope',' '.join(record['scopes'])).split()}
def main():
    import asyncio,httpx
    if os.getenv('RECON_DEPLOYMENT','hosted')!='local':raise SystemExit('このサインインはローカル版専用です。共有Web版ではAPI方式を利用してください。')
    directory=Path(os.environ.get('RECON_CREDENTIAL_DIR','./.credentials'));directory.mkdir(mode=0o700,parents=True,exist_ok=True)
    hostfile=directory/'host.json'
    if not hostfile.exists():atomic_private_json(hostfile,{'id':'urn:uuid:'+str(uuid.uuid4())})
    host=json.loads(hostfile.read_text())['id'];vault=Vault(os.environ.get('RECON_ENCRYPTION_KEY',''))
    class Callback(BaseHTTPRequestHandler):
        result=None
        def log_message(self,*args):pass
        def do_GET(self):
            if urlsplit(self.path).path!='/auth/callback':self.send_error(404);return
            query={k:v[0] for k,v in parse_qs(urlsplit(self.path).query).items()}
            try:validate_callback(query,pending);Callback.result=query
            except ValueError:self.send_error(400,'Invalid OAuth callback');return
            self.send_response(200);self.send_header('Content-Type','text/plain; charset=utf-8');self.send_header('Cache-Control','no-store');self.send_header('Referrer-Policy','no-referrer');self.end_headers();self.wfile.write('サインインを受け付けました。アプリに戻ってください。'.encode())
    server=HTTPServer(('127.0.0.1',0),Callback);server.timeout=300
    url,pending=authorization_request(host,f'http://127.0.0.1:{server.server_port}/auth/callback')
    webbrowser.open(url);print('ブラウザでContinue with ChatGPTを完了してください。');server.handle_request();server.server_close()
    if not Callback.result:raise SystemExit('サインインが完了しませんでした')
    async def finish():
        async with httpx.AsyncClient(timeout=20,trust_env=False,follow_redirects=False) as client:return await exchange(Callback.result,pending,client)
    record=asyncio.run(finish());atomic_private_json(directory/'chatgpt.json',{'encrypted':vault.encrypt(record)})
    print('資格情報を暗号化して保存しました。資格情報そのものは表示しません。')
if __name__=='__main__':main()
