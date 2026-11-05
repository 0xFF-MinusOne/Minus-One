import asyncio,re
from datetime import datetime,timezone
class Intelligence:
    def __init__(self,client=None):
        if client is None:
            import httpx
            client=httpx.AsyncClient(timeout=15,follow_redirects=False,trust_env=False)
        self.client=client
    async def osv(self,purl:str,version:str)->dict:
        if not purl.startswith('pkg:') or len(purl)>1000 or not version or len(version)>200:raise ValueError('PURLと正確なバージョンが必要です')
        r=await self.client.post('https://api.osv.dev/v1/query',json={'package':{'purl':purl},'version':version});r.raise_for_status()
        return {'source':'OSV','queried_at':datetime.now(timezone.utc).isoformat(),'query':{'purl':purl,'version':version},'verification':'Potentially Affected','raw':r.json()}
    async def advisory(self,cve:str)->dict:
        if not re.fullmatch(r'CVE-\d{4}-\d{4,19}',cve):raise ValueError('CVE IDの形式が正しくありません')
        await asyncio.sleep(.65)
        r=await self.client.get('https://services.nvd.nist.gov/rest/json/cves/2.0',params={'cveId':cve});r.raise_for_status()
        return {'source':'NVD','cve':cve,'raw':r.json(),'reference':'https://nvd.nist.gov/vuln/detail/'+cve,'verification':'Not Tested'}
    async def kev(self,cve:str)->dict:
        if not re.fullmatch(r'CVE-\d{4}-\d{4,19}',cve):raise ValueError('CVE IDの形式が正しくありません')
        r=await self.client.get('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json');r.raise_for_status()
        matches=[v for v in r.json().get('vulnerabilities',[]) if v.get('cveID')==cve]
        return {'source':'CISA KEV','cve':cve,'known_exploited':bool(matches),'entries':matches,'catalog_version':r.json().get('catalogVersion')}
