import json,hashlib
from pathlib import Path
from .base import ScannerAdapter,Observation,ProcessResult
from ..security.policy import canonical_target
class NucleiAdapter(ScannerAdapter):
    name='nuclei'
    def __init__(self,binary=None,manifest='/tools/templates/approved.json'):
        super().__init__(binary);self.manifest=manifest
    def arguments(self,target:str,options:dict)->list[str]:
        _,ip,_=canonical_target(target)
        if not ip or not target.startswith(('http://','https://')):raise ValueError('承認済みIPのHTTP/HTTPS URLが必要です')
        template_id=options.get('template_id');registry=json.loads(Path(self.manifest).read_text())
        entry=registry.get(template_id)
        if not entry or entry.get('methods')!=['GET'] or entry.get('protocol')!='http' or not entry.get('reviewed_non_destructive'):raise PermissionError('レビュー済みの非破壊GETテンプレートのみ利用できます')
        path=(Path(self.manifest).parent/entry['path']).resolve()
        if not path.is_relative_to(Path(self.manifest).parent.resolve()):raise PermissionError('テンプレートのパスが正しくありません')
        if hashlib.sha256(path.read_bytes()).hexdigest()!=entry['sha256']:raise PermissionError('承認したテンプレートの内容と一致しません')
        return ['-u',target,'-t',str(path),'-jsonl','-silent','-ni','-duc','-dr','-rl','1','-c','1','-timeout','10','-retries','0','-etags','dos,fuzz,bruteforce,headless,code,javascript']
    def normalize(self,raw_result:ProcessResult,target:str)->list[Observation]:
        rows=[]
        for line in raw_result.stdout.splitlines():
            r=json.loads(line);info=r.get('info',{})
            rows.append(Observation(target,self.name,raw_result.version,'vulnerability',{'template_id':r.get('template-id'),'name':info.get('name'),'severity':info.get('severity'),'cve':info.get('classification',{}).get('cve-id',[]),'matched_at':r.get('matched-at'),'verification':'Potentially Affected','references':info.get('reference',[])},'tool_match'))
        return rows
