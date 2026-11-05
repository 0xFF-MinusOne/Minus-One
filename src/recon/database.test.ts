import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
let db:PGlite;
const user='00000000-0000-4000-8000-000000000011';const project='00000000-0000-4000-8000-000000000021';
async function claims(aal='aal2',uid=user){await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:uid,aal})])}
beforeAll(async()=>{
 db=new PGlite();await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,encrypted_password text);create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;`);
},30000);
afterAll(async()=>{await db?.close()});
describe('Recon PostgreSQL migrations',()=>{
 it('既存スキーマから追加マイグレーションを適用できる',async()=>{
  await db.exec(`drop function auth.uid();create function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}')$$;grant usage on schema auth to authenticated;grant execute on all functions in schema auth to authenticated;`);
  for(const filename of ['20261104000000_initial_schema.sql','20261105000000_must_change_password.sql','20261106000000_recon.sql','20261107000000_engine.sql','20261108000000_benchmark.sql','20261109000000_recon_integrity.sql'])await db.exec(readFileSync(new URL('../../supabase/migrations/'+filename,import.meta.url),'utf8'));
  await db.exec(`insert into auth.users(id) values('${user}');insert into members(user_id,email,role) values('${user}','test@example.test','admin');`);await claims();await db.exec(`insert into projects(id,name) values('${project}','Test project');`);
  expect((await db.query('select count(*)::int as n from recon_assets')).rows).toEqual([{n:0}]);
 });
 it('取り込みは原子的で重複を更新し、同じ結果から差分を増やさない',async()=>{
  const input=[{host:'API.EXAMPLE.TEST.',type:'Host',services:[{port:443,protocol:'https',tls:'TLS 1.3'}],technologies:[{name:'nginx',version:'1.24'}]}];
  const call=()=>db.query('select import_recon_assets($1,$2::jsonb,$3)',[project,JSON.stringify(input),'fixture.json']);await call();await call();
  expect((await db.query('select host,status,risk from recon_assets')).rows).toEqual([{host:'api.example.test',status:'Unknown',risk:'Unknown'}]);
  expect((await db.query('select count(*)::int as n from recon_diffs')).rows).toEqual([{n:3}]);
  await expect(db.query('select import_recon_assets($1,$2::jsonb,$3)',[project,JSON.stringify([{host:'good.test'},{host:'bad test'}]),'bad.json'])).rejects.toThrow();
  expect((await db.query("select count(*)::int as n from recon_assets where host='good.test'")).rows).toEqual([{n:0}]);
 });
 it('未検証Findingへの昇格は同じメモから二重登録しない',async()=>{
  const note=await db.query<{id:string}>('insert into recon_notes(project_id,body) values($1,$2) returning id',[project,'調査の仮説']);const id=note.rows[0]!.id;
  const a=await db.query('select promote_recon_note($1,$2,$3)',[id,'Test','medium']);const b=await db.query('select promote_recon_note($1,$2,$3)',[id,'Test','medium']);expect(a.rows).toEqual(b.rows);
  expect((await db.query('select verification_status from findings')).rows).toEqual([{verification_status:'unverified'}]);
 });
 it('MFAなし・権限なし・別案件の子要素を拒否する',async()=>{
  await claims('aal1');await expect(db.query('select import_recon_assets($1,$2::jsonb,$3)',[project,'[{"host":"rejected.test"}]','file.json'])).rejects.toThrow();await claims();
  await db.exec('set role authenticated');await expect(db.query('insert into recon_notes(project_id,body) values($1,$2)',['00000000-0000-4000-8000-000000000099','forbidden'])).rejects.toThrow();
  await expect(db.query('select encrypted_credentials from recon_ai_connections')).rejects.toThrow();await db.exec('reset role');
 });
});
