import re
SECRET=re.compile(r'(?im)(authorization|proxy-authorization|cookie|set-cookie|x-api-key|api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)(["\s]*[:=]["\s]*)([^\r\n,}]+)')
def redact(value:str)->str:
    value=SECRET.sub(lambda m:m.group(1)+m.group(2)+'[REDACTED]',value)
    return re.sub(r'(?i)([?&](?:token|key|password|secret|code)=)[^&\s"<>]+',r'\1[REDACTED]',value)
