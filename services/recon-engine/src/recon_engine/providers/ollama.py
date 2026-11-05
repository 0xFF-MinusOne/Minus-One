import json
from urllib.parse import urlsplit
from .base import AIProvider,Capabilities,Usage,ProviderError
class OllamaProvider(AIProvider):
    def __init__(self,model,base_url,client=None):
        super().__init__(model)
        # Administrator-controlled local destination only; browser never supplies arbitrary URLs.
        u=urlsplit(base_url)
        if u.scheme not in ('http','https') or u.username or u.password or u.query or u.fragment:raise ValueError('Ollama接続先が正しくありません')
        self.base=base_url.rstrip('/');self._caps=Capabilities(authentication='local',local=True)
        if client is None:
            import httpx
            client=httpx.AsyncClient(timeout=60,trust_env=False,follow_redirects=False)
        self.client=client
    async def list_models(self):
        r=await self.client.get(self.base+'/api/tags');r.raise_for_status();return [{'id':m['name'],'name':m['name']} for m in r.json().get('models',[])]
    async def detect_capabilities(self):
        r=await self.client.post(self.base+'/api/show',json={'model':self.model});r.raise_for_status();c=r.json().get('capabilities',[])
        self._caps=Capabilities(tool_calling='tools' in c,structured_output=True,authentication='local',local=True);return self._caps
    def get_capabilities(self):return self._caps
    async def health_check(self):
        status=await super().health_check()
        if status['connected'] and self.model:
            try:status['capabilities']=(await self.detect_capabilities()).__dict__
            except Exception:status['reason']='選択モデルの機能を確認できませんでした'
        return status
    async def generate(self,messages,tools=None,**kwargs):return await self.collect(messages,tools,**kwargs)
    async def stream(self,messages,tools=None,**kwargs):
        if tools and not self._caps.tool_calling:raise ProviderError('unsupported','このモデルのTool Callingは未対応または未確認です')
        body={'model':self.model,'messages':messages,'stream':True,'options':{'num_predict':kwargs.get('max_output_tokens',2000)}}
        if tools:body['tools']=[{'type':'function','function':t} for t in tools]
        if kwargs.get('schema'):body['format']=kwargs['schema']
        try:
            async with self.client.stream('POST',self.base+'/api/chat',json=body) as r:
                r.raise_for_status()
                async for line in r.aiter_lines():
                    if not line:continue
                    event=json.loads(line)
                    if event.get('error'):raise ProviderError('local_model_error','モデルのメモリ・GPU・ロード状態を確認してください')
                    msg=event.get('message',{})
                    if msg.get('content'):yield {'type':'text','text':msg['content']}
                    for call in msg.get('tool_calls',[]):yield {'type':'tool_call','call':call}
                    if event.get('done'):
                        self.usage=Usage(event.get('prompt_eval_count',0),event.get('eval_count',0),estimated_cost=0)
                        yield {'type':'done'}
        except ProviderError:raise
        except Exception:raise ProviderError('local_connection','Ollamaの接続・モデル・メモリを確認してください') from None
