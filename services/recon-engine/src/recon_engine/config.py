from dataclasses import dataclass
import os
@dataclass(frozen=True)
class Settings:
    database_url: str = os.getenv('DATABASE_URL', '')
    redis_url: str = os.getenv('REDIS_URL', 'redis://redis:6379/0')
    service_secret: str = os.getenv('RECON_SERVICE_SECRET', '')
    deployment: str = os.getenv('RECON_DEPLOYMENT', 'hosted')
    active_scans: bool = os.getenv('RECON_ENABLE_ACTIVE_SCANS', 'false') == 'true'
    timeout: int = min(600, int(os.getenv('RECON_JOB_TIMEOUT', '120')))
    concurrency: int = min(4, max(1, int(os.getenv('RECON_CONCURRENCY', '1'))))
    max_output_bytes: int = 5 * 1024 * 1024
    credential_dir: str = os.getenv('RECON_CREDENTIAL_DIR', '/data/credentials')
    encryption_key: str = os.getenv('RECON_ENCRYPTION_KEY', '')
    ollama_url: str = os.getenv('OLLAMA_URL', 'http://ollama:11434')
    model: str = os.getenv('AI_MODEL', '')
    approved_templates: str = os.getenv('RECON_TEMPLATE_MANIFEST', '/tools/templates/approved.json')
settings = Settings()
