from .base import AIProvider,Capabilities,Usage,ProviderError
class OpenAIProvider(AIProvider):
    def __init__(self,model,key,client=None):
        super().__init__(model)
        if client is None:
            from openai import AsyncOpenAI
            client=AsyncOpenAI(api_key=key,max_retries=0,timeout=45)
        self.client=client
    def get_capabilities(self):return Capabilities(tool_calling=True,structured_output=True)
    async def list_models(self):
        data=await self.client.models.list();return [{'id':m.id,'name':m.id} for m in data.data]
    async def generate(self,messages,tools=None,**kwargs):
        if tools or kwargs.get('schema'):return await self.collect(messages,tools,**kwargs)
        from ..agents.sdk_adapter import generate_with_agents
        result=await generate_with_agents(self.client,self.model,messages,kwargs.get('max_output_tokens',2000))
        self.usage=result.usage
        return result
    async def stream(self,messages,tools=None,**kwargs):
        params={'model':self.model,'input':messages,'stream':True,'store':False,'max_output_tokens':kwargs.get('max_output_tokens',2000)}
        if tools:params['tools']=tools
        if kwargs.get('schema'):params['text']={'format':{'type':'json_schema','name':'research_output','schema':kwargs['schema'],'strict':True}}
        try:
            stream=await self.client.responses.create(**params)
            async with stream:
                async for e in stream:
                    if e.type=='response.output_text.delta':yield {'type':'text','text':e.delta}
                    elif e.type=='response.output_item.done' and e.item.type=='function_call':yield {'type':'tool_call','call':e.item.model_dump()}
                    elif e.type=='response.completed':
                        u=e.response.usage;self.usage=Usage(u.input_tokens,u.output_tokens);yield {'type':'done'}
                    elif e.type in ('response.failed','response.incomplete','error'):
                        raise ProviderError('incomplete','利用上限または応答エラー。未完了の結果は採用しません')
        except ProviderError:raise
        except Exception as e:
            code='rate_limit' if getattr(e,'status_code',None)==429 else 'provider_error'
            raise ProviderError(code,'OpenAI接続・認証・利用枠を確認してください') from None
