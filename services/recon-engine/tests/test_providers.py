import unittest,sys,json
from pathlib import Path
from types import SimpleNamespace as N
from unittest.mock import AsyncMock,patch
sys.path.insert(0,str(Path(__file__).parents[1]/'src'))
from recon_engine.providers.base import Generation,Usage,ProviderError
from recon_engine.providers.openai_api import OpenAIProvider
from recon_engine.providers.anthropic_api import AnthropicProvider
from recon_engine.providers.chatgpt import ChatGPTProvider
from recon_engine.providers.ollama import OllamaProvider
class Stream:
    def __init__(self,events):self.events=events
    async def __aenter__(self):return self
    async def __aexit__(self,*args):pass
    def __aiter__(self):
        async def loop():
            for event in self.events:yield event
        return loop()
class ProviderTests(unittest.IsolatedAsyncioTestCase):
    async def test_openai_sdk_delegation(self):
        p=OpenAIProvider('fixture','secret',client=N())
        with patch('recon_engine.agents.sdk_adapter.generate_with_agents',new=AsyncMock(return_value=Generation('ok',Usage(10,4)))) as call:
            r=await p.generate([{'role':'user','content':'fixture'}]);self.assertEqual(r.text,'ok');self.assertEqual((await p.get_usage()).input_tokens,10);call.assert_awaited_once()
    async def test_openai_stream_usage(self):
        events=[N(type='response.output_text.delta',delta='safe'),N(type='response.completed',response=N(usage=N(input_tokens=4,output_tokens=2)))]
        p=OpenAIProvider('fixture','secret',client=N(responses=N(create=AsyncMock(return_value=Stream(events)))))
        r=await p.collect([{'role':'user','content':'x'}]);self.assertEqual(r.text,'safe');self.assertEqual(r.usage.output_tokens,2)
    async def test_partial_stream_is_not_success(self):
        p=OpenAIProvider('fixture','secret',client=N(responses=N(create=AsyncMock(return_value=Stream([N(type='response.output_text.delta',delta='partial')])))))
        with self.assertRaises(ProviderError):await p.collect([])
    async def test_chatgpt_hosted_disabled_and_stream_contract(self):
        with self.assertRaises(ProviderError):ChatGPTProvider('x','secret','hosted',client=N())
        create=AsyncMock(return_value=Stream([N(type='response.completed',response=N(usage=N(input_tokens=1,output_tokens=1)))]));p=ChatGPTProvider('fixture','secret','local',client=N(responses=N(create=create)))
        await p.generate([{'role':'developer','content':'safety'},{'role':'user','content':'x'}]);kwargs=create.call_args.kwargs;self.assertTrue(kwargs['stream']);self.assertFalse(kwargs['store']);self.assertNotIn('max_output_tokens',kwargs);self.assertNotIn('previous_response_id',kwargs)
    async def test_anthropic_usage_and_rate_limit(self):
        class ClaudeStream:
            text_stream=Stream(['answer'])
            async def __aenter__(self):return self
            async def __aexit__(self,*args):pass
            async def get_final_message(self):return N(usage=N(input_tokens=20,output_tokens=3),content=[],stop_reason='end_turn')
        p=AnthropicProvider('fixture','secret',client=N(messages=N(stream=lambda **kwargs:ClaudeStream())))
        r=await p.generate([{'role':'user','content':'x'}]);self.assertEqual(r.text,'answer');self.assertEqual(r.usage.input_tokens,20)
        def reject(**kwargs):e=RuntimeError();e.status_code=429;raise e
        p.client.messages.stream=reject
        with self.assertRaises(ProviderError) as e:await p.generate([])
        self.assertEqual(e.exception.code,'rate_limit')
    async def test_ollama_model_and_usage(self):
        class Response:
            def raise_for_status(self):pass
            def json(self):return {'models':[{'name':'fixture'}]}
            async def __aenter__(self):return self
            async def __aexit__(self,*args):pass
            async def aiter_lines(self):
                yield json.dumps({'message':{'content':'local'}});yield json.dumps({'done':True,'prompt_eval_count':3,'eval_count':2})
        client=N(get=AsyncMock(return_value=Response()),stream=lambda *args,**kwargs:Response());p=OllamaProvider('fixture','http://ollama:11434',client=client)
        self.assertEqual((await p.list_models())[0]['id'],'fixture');r=await p.generate([]);self.assertEqual(r.text,'local');self.assertEqual(r.usage.estimated_cost,0)
if __name__=='__main__':unittest.main()
