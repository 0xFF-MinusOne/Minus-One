import json
from .base import ScannerAdapter,Observation,ProcessResult
from ..security.policy import canonical_target
class SubfinderAdapter(ScannerAdapter):
    name='subfinder'
    def arguments(self,target:str,options:dict)->list[str]:
        host,ip,_=canonical_target(target)
        if ip or '://' in target:raise ValueError('subfinderにはドメインを指定してください')
        rate=int(options.get('rate',2))
        if not 1<=rate<=5:raise ValueError('レートは1〜5です')
        return ['-d',host,'-json','-silent','-rl',str(rate),'-timeout','15','-max-time','2','-duc']
    def normalize(self,raw_result:ProcessResult,target:str)->list[Observation]:
        output=[]
        for line in raw_result.stdout.splitlines():
            r=json.loads(line);host=r.get('host','').lower().rstrip('.')
            canonical_target(host)
            if host==target or host.endswith('.'+target):output.append(Observation(host,self.name,raw_result.version,'asset',{'host':host,'type':'Host','status':'Unknown','source':r.get('source')},'discovered'))
        return output
