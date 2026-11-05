"""Scope and target validation independent of adapters and LLMs. No network in tests."""
from dataclasses import dataclass
from ipaddress import ip_address, ip_network
from urllib.parse import urlsplit
import re
import socket
import asyncio
@dataclass(frozen=True)
class ScopeRule:
    kind: str
    value: str
    excluded: bool = False
    authorization: str = ''

def canonical_target(target: str) -> tuple[str, str, int | None]:
    if not target or any(c.isspace() or ord(c)<32 for c in target) or target.startswith('-') or len(target)>2048:
        raise ValueError('対象の形式が正しくありません')
    if '://' in target:
        u=urlsplit(target)
        if u.scheme not in ('http','https') or u.username or u.password or u.fragment or not u.hostname:
            raise ValueError('HTTP/HTTPSの認証情報を含まないURLが必要です')
        host=u.hostname
        port=u.port
        if port is not None and not 1<=port<=65535: raise ValueError('ポートが正しくありません')
    else:
        host=target; port=None
    host=host.lower().rstrip('.')
    try: return host, str(ip_address(host)), port
    except ValueError:
        if not re.fullmatch(r'(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?',host) or len(host)>253:
            raise ValueError('ホスト名の形式が正しくありません')
        return host,'',port

def matches(host: str, rule: ScopeRule) -> bool:
    if rule.kind=='domain':
        root=rule.value.lower().rstrip('.').removeprefix('*.')
        return host.endswith('.'+root) or (not rule.value.startswith('*.') and host==root)
    try:
        ip=ip_address(host)
        return ip in ip_network(rule.value,strict=False) if rule.kind=='cidr' else ip==ip_address(rule.value)
    except ValueError: return False

class ScopePolicy:
    def __init__(self,rules:list[ScopeRule]): self.rules=rules
    def allows(self,target:str)->bool:
        host,_,_=canonical_target(target)
        if any(matches(host,r) for r in self.rules if r.excluded): return False
        return any(matches(host,r) and r.authorization.strip() for r in self.rules if not r.excluded)
    def require(self,target:str)->None:
        if not self.allows(target): raise PermissionError('診断範囲外、または許可根拠が未登録です')
    async def resolved(self,target:str,resolver=None)->list[str]:
        self.require(target);host,literal,_=canonical_target(target)
        if literal: addresses=[literal]
        else:
            resolver=resolver or asyncio.get_running_loop().getaddrinfo
            records=await resolver(host,None,type=socket.SOCK_STREAM)
            addresses=sorted({r[4][0] for r in records})
        if not addresses: raise PermissionError('対象を名前解決できません')
        for value in addresses:
            ip=ip_address(value)
            if ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_unspecified or ip.is_reserved:
                raise PermissionError('ループバック・メタデータ・特殊アドレスは禁止です')
            # Every IP, including DNS-derived IPs, needs an explicit IP/CIDR authorization.
            self.require(value)
        return addresses
