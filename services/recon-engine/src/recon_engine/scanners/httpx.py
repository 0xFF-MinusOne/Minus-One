import json
from .base import ScannerAdapter,Observation,ProcessResult
from ..security.policy import canonical_target
class HttpxAdapter(ScannerAdapter):
    name='httpx'
    def arguments(self,target:str,options:dict)->list[str]:
        _,ip,_=canonical_target(target)
        if not ip:raise ValueError('通信先を固定するため、承認済みのIP URLを指定してください')
        if not target.startswith(('http://','https://')):raise ValueError('httpxにはHTTP/HTTPS URLが必要です')
        return ['-u',target,'-json','-silent','-sc','-title','-td','-server','-ip','-tls-grab','-timeout','10','-retries','0','-rl','2','-threads','1','-duc']
    def normalize(self,raw_result:ProcessResult,target:str)->list[Observation]:
        rows=[]
        for line in raw_result.stdout.splitlines():
            r=json.loads(line)
            rows.append(Observation(target,self.name,raw_result.version,'fingerprint',{'url':r.get('url',target),'status_code':r.get('status_code'),'title':r.get('title'),'server':r.get('webserver'),'technologies':r.get('tech',[]),'tls':r.get('tls')},'inferred'))
        return rows
