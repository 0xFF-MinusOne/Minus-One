from abc import ABC,abstractmethod
from dataclasses import dataclass,field
from typing import AsyncIterator
@dataclass(frozen=True)
class Capabilities:
    streaming:bool=True
    tool_calling:bool=False
    structured_output:bool=False
    hard_output_limit:bool=True
    authentication:str='api_key'
    local:bool=False
    available:bool=True
    reason:str=''
@dataclass
class Usage:
    input_tokens:int=0
    output_tokens:int=0
    estimated_cost:float|None=None
    balance:float|None=None
    complete:bool=True
@dataclass
class Generation:
    text:str
    usage:Usage
    tool_calls:list[dict]=field(default_factory=list)
class ProviderError(RuntimeError):
    def __init__(self,code:str,message:str):self.code=code;super().__init__(message)
class AIProvider(ABC):
    def __init__(self,model:str):self.model=model;self.usage=Usage()
    @abstractmethod
    async def list_models(self)->list[dict]:...
    @abstractmethod
    async def generate(self,messages:list[dict],tools:list[dict]|None=None,**kwargs)->Generation:...
    @abstractmethod
    async def stream(self,messages:list[dict],tools:list[dict]|None=None,**kwargs)->AsyncIterator[dict]:
        yield {}
    @abstractmethod
    def get_capabilities(self)->Capabilities:...
    async def get_usage(self)->Usage:return self.usage
    async def health_check(self)->dict:
        try:return {'connected':True,'models':await self.list_models(),'capabilities':self.get_capabilities().__dict__,'balance':None}
        except Exception:return {'connected':False,'reason':'認証情報・接続先・利用枠を確認してください','balance':None}
    async def collect(self,messages,tools=None,**kwargs)->Generation:
        parts=[];calls=[];complete=False
        async for event in self.stream(messages,tools,**kwargs):
            if event['type']=='text':parts.append(event['text'])
            elif event['type']=='tool_call':calls.append(event['call'])
            elif event['type']=='done':complete=True
            if sum(map(len,parts))>128000:raise ProviderError('output_limit','出力量の上限を超えました')
        if not complete:raise ProviderError('incomplete','応答が正常に完了しませんでした')
        return Generation(''.join(parts),self.usage,calls)
