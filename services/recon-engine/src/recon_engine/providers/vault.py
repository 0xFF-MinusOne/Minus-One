import os,json,tempfile
from pathlib import Path
class Vault:
    def __init__(self,key:str):
        from cryptography.fernet import Fernet
        if not key:raise RuntimeError('資格情報・生証跡の暗号化キーが未設定です')
        self.fernet=Fernet(key.encode())
    def encrypt(self,value:dict)->str:return self.fernet.encrypt(json.dumps(value).encode()).decode()
    def decrypt(self,value:str)->dict:return json.loads(self.fernet.decrypt(value.encode()))
def atomic_private_json(path:Path,value:dict):
    path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    fd,tmp=tempfile.mkstemp(dir=path.parent)
    try:
        os.fchmod(fd,0o600)
        with os.fdopen(fd,'w') as f:json.dump(value,f);f.flush();os.fsync(f.fileno())
        os.replace(tmp,path)
    finally:
        if os.path.exists(tmp):os.unlink(tmp)
