from pydantic import BaseModel,Field,ConfigDict
from typing import Literal,Any
from uuid import UUID
from datetime import datetime
class StrictModel(BaseModel):model_config=ConfigDict(extra='forbid')
class ScanOptions(StrictModel):
    ports:list[int]=Field(default_factory=lambda:[80,443],max_length=64,min_length=1)
    rate:int=Field(default=2,ge=1,le=5)
    template_id:str|None=Field(default=None,max_length=200)
class ScanRequest(StrictModel):
    tool:Literal['subfinder','httpx','nmap','nuclei']
    target:str=Field(min_length=1,max_length=2048)
    options:ScanOptions=Field(default_factory=ScanOptions)
    authorization_confirmed:Literal[True]
    idempotency_key:UUID
class AgentRequest(StrictModel):
    objective:str=Field(min_length=1,max_length=4000)
    provider:Literal['chatgpt','anthropic','openai','ollama']
    idempotency_key:UUID
class Approval(StrictModel):plan_hash:str=Field(min_length=64,max_length=64)
class RunView(BaseModel):
    model_config=ConfigDict(from_attributes=True)
    id:UUID;project_id:UUID;user_id:UUID;kind:str;status:str;payload:dict;state:dict;cancel_requested:bool;created_at:datetime;updated_at:datetime
class ProviderSettings(StrictModel):
    provider:Literal['chatgpt','anthropic','openai','ollama']
    api_key:str|None=Field(default=None,max_length=500)
    model:str=Field(default='',max_length=200)
    monthly_budget:float=Field(default=5,ge=0,le=10000)
    input_rate:float|None=Field(default=None,ge=0,le=10000)
    output_rate:float|None=Field(default=None,ge=0,le=10000)
    auto_stop:bool=True
class BenchmarkAnswer(StrictModel):
    item_id:int=Field(ge=1,le=27)
    score:int=Field(ge=1,le=5)
    rationale:str=Field(min_length=1,max_length=10000)
    evidence_ids:list[UUID]=Field(default_factory=list,max_length=50)
class LookupRequest(StrictModel):
    asset_id:UUID
    purl:str=Field(min_length=5,max_length=1000)
    version:str=Field(min_length=1,max_length=200)
    idempotency_key:UUID
