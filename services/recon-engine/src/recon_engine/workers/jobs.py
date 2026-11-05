from arq.connections import RedisSettings
from .executor import execute
from ..config import settings
class WorkerSettings:
    functions=[execute]
    redis_settings=RedisSettings.from_dsn(settings.redis_url)
    max_jobs=settings.concurrency
    job_timeout=settings.timeout+30
    max_tries=3
    retry_jobs=True
    keep_result=3600
