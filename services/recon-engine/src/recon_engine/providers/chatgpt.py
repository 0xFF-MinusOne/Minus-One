from .openai_api import OpenAIProvider
from .base import Capabilities,Usage,ProviderError
class ChatGPTProvider(OpenAIProvider):
    def __init__(self,model,key,deployment='hosted',client=None):
        if deployment!='local':raise ProviderError('unsupported_host','共有Web版でのサブスクリプション利用は未対応です。APIまたはローカル版を利用してください')
        super().__init__(model,key,client)
    def get_capabilities(self):return Capabilities(authentication='oauth_pkce',hard_output_limit=False,structured_output=False,tool_calling=False,local=True)
    async def generate(self,messages,tools=None,**kwargs):return await self.collect(messages,tools,**kwargs)
    async def list_models(self):
        # Official subscription catalog differs from the API-key catalog.
        data=await self.client.get('/models',cast_to=dict)
        return [{'id':m['slug'],'name':m['display_name']} for m in data.get('models',[]) if m.get('visibility')=='list']
    async def stream(self,messages,tools=None,**kwargs):
        if tools:raise ProviderError('unsupported','このMVPのChatGPT Providerは分析のみ対応します')
        if kwargs.get('schema'):raise ProviderError('unsupported','ChatGPTの構造化出力はこの接続では未対応です')
        # Official public Responses endpoint, stream=true/store=false. Unsupported fields omitted.
        try:
            stream=await self.client.responses.create(model=self.model,input=[m for m in messages if m['role'] not in ('system','developer')],instructions='\n'.join(m['content'] for m in messages if m['role'] in ('system','developer')),store=False,stream=True)
            async with stream:
                async for e in stream:
                    if e.type=='response.output_text.delta':yield {'type':'text','text':e.delta}
                    elif e.type=='response.completed':
                        self.usage=Usage(e.response.usage.input_tokens,e.response.usage.output_tokens);yield {'type':'done'}
                    elif e.type in ('response.failed','response.incomplete','error'):
                        code=getattr(getattr(e,'response',None),'error',None)
                        raise ProviderError(getattr(code,'code','incomplete'),'サブスクリプション利用枠または応答の完了状態を確認してください')
        except ProviderError:raise
        except Exception:raise ProviderError('subscription_error','ChatGPTへの再サインイン、対象プラン、利用上限を確認してください') from None
