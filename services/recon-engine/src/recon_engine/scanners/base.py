from abc import ABC,abstractmethod
from dataclasses import dataclass,field,asdict
from datetime import datetime,timezone
from pathlib import Path
import asyncio,os,signal,shutil,re
from ..security.redact import redact
@dataclass
class Observation:
    target:str
    source_tool:str
    tool_version:str
    kind:str
    normalized:dict
    confidence:str='observed'
    timestamp:str=field(default_factory=lambda:datetime.now(timezone.utc).isoformat())
    evidence_reference:str|None=None
@dataclass
class ProcessResult:
    stdout:str
    stderr:str
    exit_code:int
    version:str=''
class ScannerAdapter(ABC):
    name:str
    binary:str
    def __init__(self,binary:str|None=None): self.binary=binary or '/tools/bin/'+self.name
    async def check_available(self)->bool: return bool(shutil.which(self.binary))
    async def get_version(self)->str:
        result=await self.process(['--version'] if self.name=='nmap' else ['-version'],timeout=5,limit=8192)
        version=(result.stdout+' '+result.stderr).strip()
        if result.exit_code!=0 or not version: raise RuntimeError('ツールのバージョンを確認できません')
        return version[:500]
    async def process(self,args:list[str],timeout:int=120,limit:int=5*1024*1024,cancel:asyncio.Event|None=None)->ProcessResult:
        if not all(isinstance(a,str) and '\x00' not in a for a in args): raise ValueError('引数が正しくありません')
        if not Path(self.binary).is_absolute(): raise ValueError('ツールは管理者設定の絶対パスのみ許可します')
        proc=await asyncio.create_subprocess_exec(self.binary,*args,stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.PIPE,start_new_session=True,env={'PATH':'/tools/bin:/usr/bin:/bin','HOME':'/tmp','LANG':'C.UTF-8','GOMAXPROCS':'2'})
        async def read(stream):
            output=bytearray()
            while chunk:=await stream.read(65536):
                output.extend(chunk)
                if len(output)>limit: raise RuntimeError('出力量の上限を超えました')
            return output.decode('utf8',errors='replace')
        async def wait():
            out,err=await asyncio.gather(read(proc.stdout),read(proc.stderr));await proc.wait();return ProcessResult(out,err,proc.returncode)
        task=asyncio.create_task(wait());cancel_task=asyncio.create_task(cancel.wait()) if cancel else None
        try:
            done,_=await asyncio.wait([task]+([cancel_task] if cancel_task else []),timeout=timeout,return_when=asyncio.FIRST_COMPLETED)
            if task in done:return await task
            if cancel_task and cancel_task in done:raise asyncio.CancelledError('ジョブを停止しました')
            raise TimeoutError('スキャンが制限時間を超えました')
        finally:
            if proc.returncode is None:
                try:os.killpg(proc.pid,signal.SIGTERM)
                except ProcessLookupError:pass
                try:await asyncio.wait_for(proc.wait(),2)
                except TimeoutError:
                    try:os.killpg(proc.pid,signal.SIGKILL)
                    except ProcessLookupError:pass
                    await proc.wait()
            for t in [task,cancel_task]:
                if t and not t.done():t.cancel()
            await asyncio.gather(*[t for t in [task,cancel_task] if t],return_exceptions=True)
    @abstractmethod
    def arguments(self,target:str,options:dict)->list[str]:...
    @abstractmethod
    def normalize(self,raw_result:ProcessResult,target:str)->list[Observation]:...
    async def execute(self,target:str,options:dict,**kwargs)->ProcessResult:
        if not await self.check_available():raise RuntimeError(f'{self.name}が未導入です。公式バイナリを別途導入してください')
        version=await self.get_version();expected=options.pop('_expected_version',None)
        if expected and expected not in version:raise RuntimeError('固定したツールバージョンと一致しません')
        result=await self.process(self.arguments(target,options),**kwargs);result.version=version
        return result
