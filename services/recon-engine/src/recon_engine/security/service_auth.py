"""Short-lived, body-bound assertions signed by the Hono gateway, not user auth."""
import base64,json,hmac,hashlib,time
from uuid import UUID
def b64decode(s):return base64.urlsafe_b64decode(s+'='*(-len(s)%4))
def verify_assertion(token:str,secret:str,method:str,path:str,body:bytes,now:float|None=None)->dict:
    if len(secret)<32:raise PermissionError('サービス認証が未設定です')
    try:
        payload,signature=token.split('.')
        expected=hmac.new(secret.encode(),payload.encode(),hashlib.sha256).digest()
        if not hmac.compare_digest(expected,b64decode(signature)):raise ValueError()
        claims=json.loads(b64decode(payload));clock=now or time.time()
        if not clock-60<=claims['iat']<=clock+5:raise ValueError()
        if claims['method']!=method or claims['path']!=path or claims['body_sha256']!=hashlib.sha256(body).hexdigest():raise ValueError()
        UUID(claims['project_id']);UUID(claims['user_id']);UUID(claims['nonce'])
        if claims.get('aal')!='aal2':raise ValueError()
        return claims
    except (ValueError,KeyError,TypeError):raise PermissionError('サービス認証に失敗しました') from None
