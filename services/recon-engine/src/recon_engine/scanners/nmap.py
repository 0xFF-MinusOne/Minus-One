from xml.etree import ElementTree
from .base import ScannerAdapter,Observation,ProcessResult
from ..security.policy import canonical_target
class NmapAdapter(ScannerAdapter):
    name='nmap'
    def arguments(self,target:str,options:dict)->list[str]:
        _,ip,_=canonical_target(target)
        if not ip or '://' in target:raise ValueError('Nmapには承認済みIPを指定してください')
        ports=options.get('ports',[80,443])
        if not isinstance(ports,list) or not 1<=len(ports)<=64 or any(type(p) is not int or not 1<=p<=65535 for p in ports):raise ValueError('ポートは1〜65535の整数、最大64件です')
        return ['-sT','-sV','--version-light','-n','-Pn','--max-rate','5','--max-retries','1','--host-timeout','90s','-p',','.join(str(p) for p in sorted(set(ports))),'-oX','-',ip]
    def normalize(self,raw_result:ProcessResult,target:str)->list[Observation]:
        # Nmap output may contain a benign DOCTYPE, but entities/external subsets are never accepted.
        text=raw_result.stdout
        if '<!ENTITY' in text.upper() or '<!DOCTYPE' in text.upper() and (' SYSTEM ' in text.upper() or ' PUBLIC ' in text.upper() or '[' in text.split('<!DOCTYPE',1)[-1].split('>',1)[0]):raise ValueError('外部参照を含むXMLは禁止です')
        root=ElementTree.fromstring(text);rows=[]
        for p in root.findall('.//host/ports/port'):
            state=p.find('state');service=p.find('service')
            if state is None:continue
            s=service.attrib if service is not None else {}
            rows.append(Observation(target,self.name,raw_result.version,'service',{'port':int(p.attrib['portid']),'transport':p.attrib['protocol'],'state':state.attrib.get('state','unknown'),'name':s.get('name'),'product':s.get('product'),'version':s.get('version'),'cpe':[c.text for c in service.findall('cpe')] if service is not None else []},'inferred' if s.get('method')=='table' else 'observed'))
        return rows
