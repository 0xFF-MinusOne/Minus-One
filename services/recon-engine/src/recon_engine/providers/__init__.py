from .anthropic_api import AnthropicProvider
from .openai_api import OpenAIProvider
from .ollama import OllamaProvider
from .chatgpt import ChatGPTProvider
from .base import ProviderError
from ..config import settings

def make_provider(name,model,credentials):
    if name=='anthropic':return AnthropicProvider(model,credentials['api_key'])
    if name=='openai':return OpenAIProvider(model,credentials['api_key'])
    if name=='ollama':return OllamaProvider(model,settings.ollama_url)
    if name=='chatgpt':return ChatGPTProvider(model,credentials['access_token'],settings.deployment)
    raise ProviderError('unsupported','未対応のProviderです')
