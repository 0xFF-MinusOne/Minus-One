"""Official Agents SDK integration, isolated so other Providers need no OpenAI dependency at runtime."""
from ..providers.base import Generation,Usage,ProviderError
async def generate_with_agents(client,model,messages,max_tokens=2000):
    from agents import Agent,Runner,RunConfig,ModelSettings,OpenAIResponsesModel
    instructions='\n'.join(m['content'] for m in messages if m['role'] in ('system','developer'))
    inputs=[m for m in messages if m['role'] in ('user','assistant')]
    agent=Agent(name='Minus One Research',instructions=instructions,model=OpenAIResponsesModel(model=model,openai_client=client),model_settings=ModelSettings(max_tokens=max_tokens,store=False),tools=[])
    result=await Runner.run(agent,inputs,max_turns=3,run_config=RunConfig(tracing_disabled=True))
    usage=result.context_wrapper.usage
    return Generation(str(result.final_output),Usage(usage.input_tokens,usage.output_tokens))
