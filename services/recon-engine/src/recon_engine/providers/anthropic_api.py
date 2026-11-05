from .base import AIProvider,Capabilities,Usage,ProviderError
class AnthropicProvider(AIProvider):
    def __init__(self,model,key,client=None):
        super().__init__(model)
        if client is None:
            from anthropic import AsyncAnthropic
            client=AsyncAnthropic(api_key=key,max_retries=0,timeout=45)
        self.client=client
    def get_capabilities(self):return Capabilities(tool_calling=True,structured_output=True)
    async def list_models(self):
        data=await self.client.models.list();return [{'id':m.id,'name':m.display_name} for m in data.data]
    async def generate(self,messages,tools=None,**kwargs):return await self.collect(messages,tools,**kwargs)
    async def stream(self,messages,tools=None,**kwargs):
        system='\n'.join(m['content'] for m in messages if m['role'] in ('system','developer'))
        body=[m for m in messages if m['role'] in ('user','assistant')]
        params={'model':self.model,'system':system,'messages':body,'max_tokens':kwargs.get('max_output_tokens',2000)}
        if tools:params['tools']=[{'name':t['name'],'description':t.get('description',''),'input_schema':t['parameters']} for t in tools]
        # Structured output is capability/model dependent. A local validation is mandatory regardless.
        if kwargs.get('schema'):params['output_config']={'format':{'type':'json_schema','schema':kwargs['schema']}}
        try:
            async with self.client.messages.stream(**params) as stream:
                async for text in stream.text_stream:yield {'type':'text','text':text}
                result=await stream.get_final_message()
                self.usage=Usage(result.usage.input_tokens,result.usage.output_tokens)
                for block in result.content:
                    if block.type=='tool_use':yield {'type':'tool_call','call':{'id':block.id,'name':block.name,'arguments':block.input}}
                if result.stop_reason not in ('end_turn','tool_use','stop_sequence'):raise ProviderError('incomplete','応答が上限で中断されました')
                yield {'type':'done'}
        except ProviderError:raise
        except Exception as e:
            raise ProviderError('rate_limit' if getattr(e,'status_code',None)==429 else 'provider_error','Claude APIの接続・対応モデル・利用枠を確認してください') from None
