from sqlalchemy.ext.asyncio import create_async_engine,async_sessionmaker
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import JSONB,UUID
from sqlalchemy.orm import DeclarativeBase,Mapped,mapped_column
from datetime import datetime
import uuid
from .config import settings
class Base(DeclarativeBase):pass
class EngineRun(Base):
    __tablename__='recon_engine_runs'
    id:Mapped[uuid.UUID]=mapped_column(UUID(as_uuid=True),primary_key=True,default=uuid.uuid4)
    project_id:Mapped[uuid.UUID]=mapped_column(UUID(as_uuid=True))
    user_id:Mapped[uuid.UUID]=mapped_column(UUID(as_uuid=True))
    kind:Mapped[str];status:Mapped[str];idempotency_key:Mapped[str]
    payload:Mapped[dict]=mapped_column(JSONB)
    state:Mapped[dict]=mapped_column(JSONB,default=dict)
    cancel_requested:Mapped[bool]=mapped_column(default=False)
    created_at:Mapped[datetime]=mapped_column(server_default=text('now()'))
    updated_at:Mapped[datetime]=mapped_column(server_default=text('now()'))
_engine=None
_sessions=None
def sessions():
    global _engine,_sessions
    if _sessions is None:
        if not settings.database_url:raise RuntimeError('DATABASE_URLが未設定です')
        _engine=create_async_engine(settings.database_url.replace('postgresql://','postgresql+asyncpg://',1),pool_size=5,max_overflow=0,pool_pre_ping=True,echo=False)
        _sessions=async_sessionmaker(_engine,expire_on_commit=False)
    return _sessions
async def rows(sql:str,params:dict)->list[dict]:
    async with sessions()() as s:
        return [dict(r) for r in (await s.execute(text(sql),params)).mappings()]
async def audit(project_id,user_id,run_id,action,payload):
    import json
    async with sessions()() as s:
        await s.execute(text('insert into recon_audit(project_id,user_id,run_id,action,payload) values(:p,:u,:r,:a,cast(:v as jsonb))'),{'p':project_id,'u':user_id,'r':run_id,'a':action,'v':json.dumps(payload)})
        await s.commit()
async def project_context(project_id,user_id,write=False):
    access=await rows('select a.role from recon_project_access a join members m on m.user_id=a.user_id where a.project_id=:p and a.user_id=:u and m.is_active',{'p':project_id,'u':user_id})
    if not access or write and access[0]['role'] not in ('researcher','admin'):raise PermissionError('案件の権限がありません')
    return await rows('select kind,value,excluded,"authorization" from recon_scopes where project_id=:p',{'p':project_id})
