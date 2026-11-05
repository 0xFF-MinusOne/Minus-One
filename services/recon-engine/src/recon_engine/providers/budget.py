from decimal import Decimal
import json,uuid
from sqlalchemy import text
from ..db import sessions
class BudgetExceeded(RuntimeError):pass
async def reserve(connection:dict,run_id,user_id,input_bytes:int,max_output:int)->str:
    # Reserve a conservative upper bound before contacting paid APIs. Unknown pricing fails closed.
    local=connection['provider']=='ollama';subscription=connection['provider']=='chatgpt'
    if not local and not subscription and (connection['input_rate'] is None or connection['output_rate'] is None):raise BudgetExceeded('モデルの料金単価が未設定です。推測せず停止しました')
    reserve_cost=Decimal(0) if local or subscription else (Decimal(input_bytes+4096)*connection['input_rate']+Decimal(max_output)*connection['output_rate'])/1000000
    key=str(uuid.uuid4())
    async with sessions()() as s:
        await s.execute(text('select id from recon_ai_connections where id=:id for update'),{'id':connection['id']})
        totals=(await s.execute(text("select coalesce(sum(coalesce(estimated_cost,reserved_cost)),0) as cost,count(*) filter(where status='unknown') as unknown from recon_ai_usage where connection_id=:id and created_at>=date_trunc('month',now())"),{'id':connection['id']})).mappings().one()
        if totals['unknown']:raise BudgetExceeded('前回の使用量が未確定です。確認するまで自動実行を停止します')
        if connection['auto_stop'] and totals['cost']+reserve_cost>connection['monthly_budget']:raise BudgetExceeded('月次予算の上限に達するため実行を停止しました')
        await s.execute(text("insert into recon_ai_usage(id,connection_id,run_id,user_id,reserved_cost,status) values(:id,:c,:r,:u,:v,'reserved')"),{'id':key,'c':connection['id'],'r':run_id,'u':user_id,'v':reserve_cost});await s.commit()
    return key
async def finish(key,usage,connection,unknown=False):
    cost=None if unknown or connection['provider']=='chatgpt' else Decimal(0) if connection['provider']=='ollama' else (Decimal(usage.input_tokens)*connection['input_rate']+Decimal(usage.output_tokens)*connection['output_rate'])/1000000
    async with sessions()() as s:
        await s.execute(text('update recon_ai_usage set input_tokens=:i,output_tokens=:o,estimated_cost=:c,status=:s where id=:id'),{'i':usage.input_tokens,'o':usage.output_tokens,'c':cost,'s':'unknown' if unknown else 'completed','id':key});await s.commit()
