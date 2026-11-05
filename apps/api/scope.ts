import {BlockList,isIP} from 'node:net';
export interface ScopeRule{kind:string;value:string;excluded:boolean;authorization:string}
export function hostOf(target:string):string{
 if(!target||target.length>2048||/[\s\x00-\x1f]/.test(target)||target.startsWith('-'))throw Error('対象の形式が正しくありません');
 if(target.includes('://')){const u=new URL(target);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.hash)throw Error('HTTP/HTTPSの対象のみ指定できます');return u.hostname.replace(/^\[|\]$/g,'').toLowerCase().replace(/\.$/,'')}
 const h=target.toLowerCase().replace(/\.$/,'');if(!isIP(h)&&!/^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(h))throw Error('ホスト名が正しくありません');return h;
}
export function inScope(target:string,rules:ScopeRule[]):boolean{
 const host=hostOf(target);
 function match(r:ScopeRule){if(r.kind==='domain'){const root=r.value.toLowerCase().replace(/^\*\./,'').replace(/\.$/,'');return host.endsWith('.'+root)||(!r.value.startsWith('*.')&&host===root)}
 if(!isIP(host))return false;try{const list=new BlockList();const family=isIP(host)===4?'ipv4':'ipv6';if(r.kind==='ip')list.addAddress(r.value,family);else{const [base,prefix]=r.value.split('/');if(!base||!prefix)return false;list.addSubnet(base,Number(prefix),family)}return list.check(host,family)}catch{return false}}
 return !rules.some(r=>r.excluded&&match(r))&&rules.some(r=>!r.excluded&&r.authorization.trim()&&match(r));
}
