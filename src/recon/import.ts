import {z} from 'zod';
import type {Json} from '../lib/database.types';
const ip=z.union([z.ipv4(),z.ipv6()]);
const hostPattern=/^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const object=z.record(z.string(),z.unknown());
const serviceSchema=z.object({port:z.coerce.number().int().min(1).max(65535),transport:z.enum(['tcp','udp']).default('tcp'),protocol:z.string().max(200).default(''),banner:z.string().max(10000).default(''),tls:z.string().max(10000).default(''),state:z.enum(['open','closed','unknown']).default('open')});
const techSchema=z.object({name:z.string().trim().min(1).max(200),version:z.string().max(200).default(''),evidence:z.string().max(10000).default('')});
export function parseCsv(text:string):Record<string,string>[] {
 const rows:string[][]=[];let row:string[]=[],cell='',quoted=false,closed=false;
 text=text.replace(/^\uFEFF/,'');
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++}else{quoted=false;closed=true}}else cell+=c;continue}
  if(c==='"'){if(cell.length||closed)throw Error('CSVの引用符が正しくありません。');quoted=true;continue}
  if(c===','||c==='\n'||c==='\r'){
   row.push(cell);cell='';closed=false;
   if(c!==','){if(row.some(v=>v.trim()))rows.push(row);row=[];if(c==='\r'&&text[i+1]==='\n')i++}continue;
  }
  if(closed&&c?.trim())throw Error('CSVの引用符の後に不要な文字があります。');
  if(!closed)cell+=c;
 }
 if(quoted)throw Error('CSVの引用符が閉じられていません。');
 row.push(cell);if(row.some(v=>v.trim()))rows.push(row);
 const headers=rows.shift()?.map(s=>s.trim());
 if(!headers?.length||headers.some(s=>!s)||new Set(headers).size!==headers.length)throw Error('CSVの列名が空または重複しています。');
 if(!headers.includes('host'))throw Error('host列が必要です。');
 return rows.map((r,i)=>{if(r.length!==headers.length)throw Error(`${i+2}行目の列数が一致しません。`);return Object.fromEntries(headers.map((h,j)=>[h,r[j]||'']))});
}
export function normalizeRows(input:unknown):Json[] {
 const rows=Array.isArray(input)?input:(object.safeParse(input).success?(input as Record<string,unknown>).assets:undefined);
 if(!Array.isArray(rows)||!rows.length||rows.length>5000)throw Error('1〜5000件の資産配列が必要です。');
 const seen=new Set<string>();
 return rows.map((raw,i)=>{
  try{
   const r=object.parse(raw);const host=z.string().trim().min(1).max(253).parse(r.host).toLowerCase().replace(/\.$/,'');
   const type=r.type|| (ip.safeParse(host).success?'IP':'Host');
   if(type!=='Host'&&type!=='IP')throw Error('typeはHostまたはIPです。');
   if(type==='IP'&&!ip.safeParse(host).success)throw Error('IPの形式が正しくありません。');
   if(type==='Host'&&!hostPattern.test(host))throw Error('ホスト名の形式が正しくありません。');
   if(seen.has(host))throw Error('ファイル内でホストが重複しています。');seen.add(host);
   const parseArray=(v:unknown):unknown[]=>v===undefined||v===''?[]:Array.isArray(v)?v:z.array(z.unknown()).parse(JSON.parse(z.string().parse(v)));
   const risk=z.enum(['Critical','High','Medium','Low','Unknown']).parse(r.risk||'Unknown');
   const status=z.enum(['Live','Offline','Unknown']).parse(r.status||'Unknown');
   const tags=z.array(z.string().trim().min(1).max(100)).max(50).parse(typeof r.tags==='string'?r.tags.split(';').map(t=>t.trim()).filter(Boolean):r.tags||[]);
   const dns=z.array(z.object({type:z.string().min(1).max(20),value:z.string().min(1).max(2000)})).max(100).parse(parseArray(r.dns_records));
   const services=z.array(serviceSchema).max(1000).parse(parseArray(r.services));
   if(new Set(services.map(s=>`${s.port}/${s.transport}`)).size!==services.length)throw Error('同じポート・transportが重複しています。');
   const technologies=z.array(techSchema).max(200).parse(parseArray(r.technologies).map(t=>typeof t==='string'?{name:t}:t));
   if(new Set(technologies.map(t=>t.name)).size!==technologies.length)throw Error('技術名が重複しています。');
   return {host,type,risk,status,tags:[...new Set(tags)],dns_records:dns,services,technologies};
  }catch(e){throw Error(`${i+1}件目：${e instanceof z.ZodError?'項目の形式・値が正しくありません。':e instanceof Error?e.message:'入力が正しくありません。'}`)}
 });
}
export function parseImport(text:string,filename:string):Json[]{return normalizeRows(filename.toLowerCase().endsWith('.json')?JSON.parse(text):parseCsv(text))}
