-- Minus One Recon: 既存案件・Findingsを保持する追加SQL
-- Supabase project: vgkgytpqdfwwddjvtknu
-- SQL Editorで全体を1回実行してください。既存の初期スキーマは再実行しません。
-- 全変更を1トランザクションで実施。途中で失敗すると追加分はロールバックします。
begin;
set local lock_timeout='5s';
set local statement_timeout='120s';
do $preflight$
begin
 if to_regclass('public.projects') is null or to_regclass('public.findings') is null or to_regclass('public.members') is null or to_regprocedure('private.is_member()') is null then
  raise exception '既存Pentestのスキーマが見つかりません。対象プロジェクトを確認してください。';
 end if;
 if to_regclass('public.recon_assets') is not null then
  raise exception 'Reconの追加テーブルが既に存在します。重ねて実行せず、適用済みの状態を確認してください。';
 end if;
end $preflight$;


-- 20261106000000_recon.sql
-- Recon: existing projects, members, MFA and findings are reused. No sample rows.
create table public.recon_scopes (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
 kind text not null check(kind in ('domain','ip','cidr')), value text not null check(length(btrim(value)) between 1 and 253),
 excluded boolean not null default false, "authorization" text not null check(length(btrim("authorization")) between 1 and 2000),
 created_at timestamptz not null default now(), unique(project_id,kind,value)
);
create table public.recon_assets (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
 host text not null check(length(host) between 1 and 253), type text not null check(type in ('Host','IP')),
 status text not null default 'Unknown' check(status in ('Live','Offline','Unknown')),
 risk text not null default 'Unknown' check(risk in ('Critical','High','Medium','Low','Unknown')),
 tags text[] not null default '{}', dns_records jsonb not null default '[]' check(jsonb_typeof(dns_records)='array'),
 source text not null default 'manual', first_seen_at timestamptz not null default now(), last_seen_at timestamptz not null default now(),
 unique(project_id,host), unique(id,project_id)
);
create index recon_assets_project on public.recon_assets(project_id,last_seen_at desc);
create table public.recon_services (
 id uuid primary key default gen_random_uuid(), project_id uuid not null, asset_id uuid not null,
 port integer not null check(port between 1 and 65535), transport text not null default 'tcp' check(transport in ('tcp','udp')),
 protocol text not null default '', banner text not null default '', tls text not null default '',
 state text not null default 'open' check(state in ('open','closed','unknown')),
 foreign key(asset_id,project_id) references public.recon_assets(id,project_id) on delete cascade,
 unique(asset_id,port,transport)
);
create index recon_services_project on public.recon_services(project_id);
create table public.recon_technologies (
 id uuid primary key default gen_random_uuid(), project_id uuid not null, asset_id uuid not null,
 name text not null check(length(btrim(name)) between 1 and 200), version text not null default '', evidence text not null default '',
 foreign key(asset_id,project_id) references public.recon_assets(id,project_id) on delete cascade, unique(asset_id,name)
);
create index recon_technologies_project on public.recon_technologies(project_id);
create table public.recon_jobs (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
 name text not null check(length(btrim(name)) between 1 and 200), target text not null check(length(btrim(target)) between 1 and 2000),
 status text not null check(status in ('Queued','Running','Completed','Failed')), source text not null,
 summary jsonb not null default '{}', created_at timestamptz not null default now(), finished_at timestamptz,
 unique(id,project_id)
);
create index recon_jobs_project on public.recon_jobs(project_id,created_at desc);
create table public.recon_diffs (
 id uuid primary key default gen_random_uuid(), project_id uuid not null, job_id uuid not null,
 host text not null, kind text not null check(kind in ('added','changed','service','technology')),
 before_data jsonb, after_data jsonb not null, created_at timestamptz not null default now(),
 foreign key(job_id,project_id) references public.recon_jobs(id,project_id) on delete cascade
);
create index recon_diffs_project on public.recon_diffs(project_id,created_at desc);
create table public.recon_notes (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
 body text not null check(length(btrim(body)) between 1 and 20000), asset_id uuid,
 finding_id uuid references public.findings(id) on delete set null,
 created_at timestamptz not null default now(), created_by uuid default auth.uid() references auth.users(id) on delete set null,
 foreign key(asset_id,project_id) references public.recon_assets(id,project_id)
);
create index recon_notes_project on public.recon_notes(project_id,created_at desc);

-- Match the existing single-team authorization model, including mandatory MFA.
do $$ declare tbl text; begin
 foreach tbl in array array['recon_scopes','recon_assets','recon_services','recon_technologies','recon_jobs','recon_diffs','recon_notes'] loop
 execute format('alter table public.%I enable row level security',tbl);
 execute format('revoke all on public.%I from public, anon, authenticated',tbl);
 execute format('grant select,insert,update,delete on public.%I to authenticated',tbl);
 execute format('create policy read_member on public.%I for select to authenticated using ((select auth.jwt()->>''aal'')=''aal2'' and (select private.is_member()))',tbl);
 execute format('create policy write_member on public.%I for insert to authenticated with check ((select auth.jwt()->>''aal'')=''aal2'' and (select private.is_member()))',tbl);
 execute format('create policy update_member on public.%I for update to authenticated using ((select auth.jwt()->>''aal'')=''aal2'' and (select private.is_member())) with check ((select auth.jwt()->>''aal'')=''aal2'' and (select private.is_member()))',tbl);
 execute format('create policy delete_admin on public.%I for delete to authenticated using ((select auth.jwt()->>''aal'')=''aal2'' and (select private.is_admin()))',tbl);
 end loop;
end $$;

create function private.validate_recon_scope() returns trigger language plpgsql set search_path='' as $$
begin
 new.value:=lower(btrim(new.value));
 if new.kind='domain' and new.value !~ '^(\*\.)?([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]*[a-z0-9])?$' then raise exception 'ドメインの形式が正しくありません'; end if;
 if new.kind='ip' then perform new.value::inet; if new.value like '%/%' then raise exception 'IPにCIDRは指定できません'; end if; end if;
 if new.kind='cidr' then perform new.value::cidr; if new.value not like '%/%' then raise exception 'CIDRにはプレフィックスが必要です'; end if; end if;
 return new;
end $$;
create trigger recon_validate_scope before insert or update on public.recon_scopes for each row execute function private.validate_recon_scope();

create function private.validate_recon_asset() returns trigger language plpgsql set search_path='' as $$
begin
 new.host:=lower(rtrim(btrim(new.host),'.'));
 if new.type='IP' then
   perform new.host::inet;
   if new.host like '%/%' then raise exception 'IP資産にCIDRは指定できません'; end if;
   new.host:=host(new.host::inet);
 elsif new.host !~ '^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]*[a-z0-9])?$' then raise exception 'ホスト名の形式が正しくありません';
 end if;
 if cardinality(new.tags)>50 then raise exception 'タグは50件までです'; end if;
 if new.last_seen_at < new.first_seen_at then raise exception '観測日時の順序が正しくありません'; end if;
 return new;
end $$;
create trigger recon_validate_asset before insert or update on public.recon_assets for each row execute function private.validate_recon_asset();

-- All imported rows and the completed import job are committed atomically.
-- Missing rows never imply deletion: imports may have partial target coverage.
create function public.import_recon_assets(p_project_id uuid,p_rows jsonb,p_filename text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare
 j uuid; row jsonb; s jsonb; t jsonb; asset public.recon_assets; old_data jsonb; new_data jsonb;
 old_service jsonb; new_service jsonb; old_tech jsonb; new_tech jsonb; h text; added integer:=0; changed integer:=0;
begin
 if (auth.jwt()->>'aal') is distinct from 'aal2' or not private.is_member() then raise exception 'メンバー権限と二段階認証が必要です' using errcode='42501'; end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 5000 then raise exception '1〜5000件の配列が必要です'; end if;
 if not exists(select 1 from public.projects where id=p_project_id) then raise exception '案件が見つかりません'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_project_id::text,0));
 insert into public.recon_jobs(project_id,name,target,status,source) values(p_project_id,'結果インポート',left(p_filename,2000),'Completed','import') returning id into j;
 for row in select value from jsonb_array_elements(p_rows) loop
   h:=lower(rtrim(btrim(row->>'host'),'.'));
   if row->>'type'='IP' then h:=host(h::inet); end if;
   select to_jsonb(a) - 'last_seen_at' into old_data from public.recon_assets a where a.project_id=p_project_id and a.host=h;
   insert into public.recon_assets(project_id,host,type,status,risk,tags,dns_records,source)
   values(p_project_id,h,coalesce(row->>'type','Host'),coalesce(row->>'status','Unknown'),coalesce(row->>'risk','Unknown'),
      array(select jsonb_array_elements_text(coalesce(row->'tags','[]'))),coalesce(row->'dns_records','[]'),'import')
   on conflict(project_id,host) do update set type=excluded.type,status=excluded.status,risk=excluded.risk,
      tags=excluded.tags,dns_records=excluded.dns_records,source=excluded.source,last_seen_at=now()
   returning * into asset;
   new_data:=to_jsonb(asset)-'last_seen_at';
   if old_data is null or old_data<>new_data then
     insert into public.recon_diffs(project_id,job_id,host,kind,before_data,after_data)
     values(p_project_id,j,h,case when old_data is null then 'added' else 'changed' end,old_data,new_data);
     if old_data is null then added:=added+1; else changed:=changed+1; end if;
   end if;
   for s in select value from jsonb_array_elements(coalesce(row->'services','[]')) loop
     select to_jsonb(sv)-'id' into old_service from public.recon_services sv where sv.asset_id=asset.id and sv.port=(s->>'port')::integer and sv.transport=coalesce(s->>'transport','tcp');
     insert into public.recon_services(project_id,asset_id,port,transport,protocol,banner,tls,state)
       values(p_project_id,asset.id,(s->>'port')::integer,coalesce(s->>'transport','tcp'),coalesce(s->>'protocol',''),coalesce(s->>'banner',''),coalesce(s->>'tls',''),coalesce(s->>'state','open'))
       on conflict(asset_id,port,transport) do update set protocol=excluded.protocol,banner=excluded.banner,tls=excluded.tls,state=excluded.state
       returning to_jsonb(recon_services)-'id' into new_service;
     if old_service is distinct from new_service then
       insert into public.recon_diffs(project_id,job_id,host,kind,before_data,after_data) values(p_project_id,j,h,'service',old_service,new_service);
     end if;
   end loop;
   for t in select value from jsonb_array_elements(coalesce(row->'technologies','[]')) loop
     select to_jsonb(tc)-'id' into old_tech from public.recon_technologies tc where tc.asset_id=asset.id and tc.name=t->>'name';
     insert into public.recon_technologies(project_id,asset_id,name,version,evidence)
       values(p_project_id,asset.id,t->>'name',coalesce(t->>'version',''),coalesce(t->>'evidence',''))
       on conflict(asset_id,name) do update set version=excluded.version,evidence=excluded.evidence
       returning to_jsonb(recon_technologies)-'id' into new_tech;
     if old_tech is distinct from new_tech then
       insert into public.recon_diffs(project_id,job_id,host,kind,before_data,after_data) values(p_project_id,j,h,'technology',old_tech,new_tech);
     end if;
   end loop;
 end loop;
 update public.recon_jobs set finished_at=now(),summary=jsonb_build_object('rows',jsonb_array_length(p_rows),'added',added,'changed',changed,
   'assets',(select count(*) from public.recon_assets where project_id=p_project_id),
   'live',(select count(*) from public.recon_assets where project_id=p_project_id and status='Live'),
   'ports',(select count(*) from public.recon_services where project_id=p_project_id and state='open'),
   'technologies',(select count(distinct name) from public.recon_technologies where project_id=p_project_id),
   'critical',(select count(*) from public.recon_assets where project_id=p_project_id and risk='Critical')) where id=j;
 return j;
end $$;
revoke all on function public.import_recon_assets(uuid,jsonb,text) from public,anon;
grant execute on function public.import_recon_assets(uuid,jsonb,text) to authenticated;

-- Promotion preserves source provenance, reuses the existing findings model and is idempotent.
create function public.promote_recon_note(p_note_id uuid,p_title text,p_severity public.finding_severity)
returns uuid language plpgsql security invoker set search_path='' as $$
declare n public.recon_notes; f uuid; location text;
begin
 if (auth.jwt()->>'aal') is distinct from 'aal2' or not private.is_member() then raise exception 'メンバー権限と二段階認証が必要です' using errcode='42501'; end if;
 select * into n from public.recon_notes where id=p_note_id for update;
 if not found then raise exception 'メモが見つかりません'; end if;
 if n.finding_id is not null then return n.finding_id; end if;
 select host into location from public.recon_assets where id=n.asset_id and project_id=n.project_id;
 insert into public.findings(project_id,title,severity,verification_status,description,affected_location,local_reference,source)
 values(n.project_id,p_title,p_severity,'unverified',n.body,location,'recon-note:'||n.id::text,'manual') returning id into f;
 update public.recon_notes set finding_id=f where id=n.id;
 return f;
end $$;
revoke all on function public.promote_recon_note(uuid,text,public.finding_severity) from public,anon;
grant execute on function public.promote_recon_note(uuid,text,public.finding_severity) to authenticated;

-- 20261107000000_engine.sql
create table public.recon_organizations(id uuid primary key default gen_random_uuid(),name text not null);
insert into public.recon_organizations(id,name) values('00000000-0000-4000-8000-0000000000ff','Minus One');
create table public.recon_project_access(
 project_id uuid not null references public.projects(id) on delete cascade,
 user_id uuid not null references public.members(user_id) on delete cascade,
 organization_id uuid not null references public.recon_organizations(id),
 role text not null check(role in ('viewer','researcher','admin')),primary key(project_id,user_id)
);
insert into public.recon_project_access(project_id,user_id,organization_id,role)
select p.id,m.user_id,'00000000-0000-4000-8000-0000000000ff',case when m.role='admin' then 'admin' else 'researcher' end from public.projects p cross join public.members m where m.is_active;
create function private.recon_access(pid uuid,write_access boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select (auth.jwt()->>'aal')='aal2' and private.is_member() and exists(select 1 from public.recon_project_access a where a.project_id=pid and a.user_id=auth.uid() and (not write_access or a.role in ('researcher','admin')))
$$;
revoke all on function private.recon_access(uuid,boolean) from public,anon;
grant execute on function private.recon_access(uuid,boolean) to authenticated;
alter table public.recon_project_access enable row level security;
revoke all on public.recon_project_access from public,anon,authenticated;
grant select,insert,update,delete on public.recon_project_access to authenticated;
create policy access_read on public.recon_project_access for select to authenticated using((auth.jwt()->>'aal')='aal2' and private.is_member() and (user_id=auth.uid() or private.is_admin()));
create policy access_manage on public.recon_project_access for all to authenticated using((auth.jwt()->>'aal')='aal2' and private.is_admin()) with check((auth.jwt()->>'aal')='aal2' and private.is_admin());
alter table public.recon_organizations enable row level security;
revoke all on public.recon_organizations from public,anon,authenticated;
grant select on public.recon_organizations to authenticated;
create policy org_read on public.recon_organizations for select to authenticated using(exists(select 1 from public.recon_project_access a where a.organization_id=id and a.user_id=auth.uid()) and (auth.jwt()->>'aal')='aal2');
create function private.recon_project_creator() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is not null then insert into public.recon_project_access(project_id,user_id,organization_id,role) values(new.id,auth.uid(),'00000000-0000-4000-8000-0000000000ff','admin'); end if;
 return new;
end $$;
create trigger recon_project_creator after insert on public.projects for each row execute function private.recon_project_creator();

do $$ declare tbl text; begin
 foreach tbl in array array['recon_scopes','recon_assets','recon_services','recon_technologies','recon_jobs','recon_diffs','recon_notes'] loop
 execute format('drop policy read_member on public.%I',tbl); execute format('drop policy write_member on public.%I',tbl);execute format('drop policy update_member on public.%I',tbl);execute format('drop policy delete_admin on public.%I',tbl);
 execute format('create policy read_project on public.%I for select to authenticated using(private.recon_access(project_id))',tbl);
 execute format('create policy write_project on public.%I for insert to authenticated with check(private.recon_access(project_id,true))',tbl);
 execute format('create policy update_project on public.%I for update to authenticated using(private.recon_access(project_id,true)) with check(private.recon_access(project_id,true))',tbl);
 execute format('create policy delete_project_admin on public.%I for delete to authenticated using(private.recon_access(project_id,true) and private.is_admin())',tbl);
 end loop;
end $$;

create table public.recon_engine_runs(
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id) on delete cascade,
 user_id uuid not null references auth.users(id),kind text not null check(kind in ('scan','research')),
 status text not null default 'queued' check(status in ('queued','running','awaiting_approval','completed','failed','cancelled','blocked')),
 idempotency_key text not null,payload jsonb not null,state jsonb not null default '{}',
 cancel_requested boolean not null default false,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(project_id,user_id,idempotency_key),unique(id,project_id)
);
create index recon_engine_runs_project on public.recon_engine_runs(project_id,created_at desc);
create table public.recon_evidence(
 id uuid primary key default gen_random_uuid(),project_id uuid not null,run_id uuid not null,
 tool text not null,tool_version text not null,target text not null,raw_encrypted text not null,raw_sha256 text not null,
 redacted_output text not null,normalized jsonb not null,exit_code integer not null,config jsonb not null,created_at timestamptz not null default now(),
 foreign key(run_id,project_id) references public.recon_engine_runs(id,project_id) on delete cascade
);
create table public.recon_audit(
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id) on delete cascade,
 user_id uuid not null,run_id uuid references public.recon_engine_runs(id),action text not null,payload jsonb not null,created_at timestamptz not null default now()
);
create table public.recon_ai_connections(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),provider text not null check(provider in ('chatgpt','openai','anthropic','ollama')),
 encrypted_credentials text not null,model text not null default '',monthly_budget numeric not null default 5 check(monthly_budget>=0),
 input_rate numeric,output_rate numeric,auto_stop boolean not null default true,enabled boolean not null default true,
 unique(user_id,provider)
);
create table public.recon_ai_usage(
 id uuid primary key default gen_random_uuid(),connection_id uuid not null references public.recon_ai_connections(id),run_id uuid not null references public.recon_engine_runs(id),
 user_id uuid not null,input_tokens integer not null default 0,output_tokens integer not null default 0,estimated_cost numeric,
 reserved_cost numeric not null default 0,status text not null check(status in ('reserved','completed','unknown')),created_at timestamptz not null default now()
);
-- Service-only mutation; browser access to tokens and raw encrypted results is never granted.
do $$ declare tbl text; begin
 foreach tbl in array array['recon_engine_runs','recon_evidence','recon_audit','recon_ai_connections','recon_ai_usage'] loop
  execute format('alter table public.%I enable row level security',tbl);
  execute format('revoke all on public.%I from public,anon,authenticated',tbl);
 end loop;
end $$;

-- 20261108000000_benchmark.sql
create table public.recon_benchmark_answers(
 project_id uuid not null references public.projects(id) on delete cascade,
 catalog_sha text not null,item_id integer not null check(item_id between 1 and 27),score integer not null check(score between 1 and 5),
 rationale text not null check(length(btrim(rationale)) between 1 and 10000),evidence_ids uuid[] not null default '{}',
 updated_by uuid not null references auth.users(id),updated_at timestamptz not null default now(),primary key(project_id,catalog_sha,item_id)
);
alter table public.recon_benchmark_answers enable row level security;
revoke all on public.recon_benchmark_answers from public,anon,authenticated;

-- 20261109000000_recon_integrity.sql
create function private.recon_note_integrity() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='INSERT' then new.created_by:=auth.uid();new.created_at:=now();
 else
   if new.id<>old.id or new.project_id<>old.project_id then raise exception 'メモの案件と識別子は変更できません'; end if;
   new.created_by:=old.created_by;new.created_at:=old.created_at;
 end if;
 if new.finding_id is not null and not exists(select 1 from public.findings f where f.id=new.finding_id and f.project_id=new.project_id) then raise exception '別案件のFindingには関連付けできません'; end if;
 return new;
end $$;
create trigger recon_note_integrity before insert or update on public.recon_notes for each row execute function private.recon_note_integrity();
create function private.audit_recon_change() returns trigger language plpgsql security definer set search_path='' as $$
declare record_data jsonb; pid uuid;
begin
 if auth.uid() is null then return null; end if;
 record_data:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 pid:=(record_data->>'project_id')::uuid;
 if not exists(select 1 from public.projects where id=pid) then return null; end if;
 insert into public.recon_audit(project_id,user_id,action,payload) values(pid,auth.uid(),tg_table_name||'.'||lower(tg_op),jsonb_build_object('id',record_data->>'id'));
 return null;
end $$;
do $$ declare tbl text; begin
 foreach tbl in array array['recon_assets','recon_scopes','recon_notes','recon_services','recon_technologies'] loop
 execute format('create trigger audit_recon_change after insert or update or delete on public.%I for each row execute function private.audit_recon_change()',tbl);
 end loop;
end $$;

commit;
select 'Recon schema ready' as result, (select count(*) from public.projects) as existing_projects, (select count(*) from public.findings) as existing_findings;
