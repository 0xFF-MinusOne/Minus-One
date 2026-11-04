-- Pentest Dashboard の初期スキーマ。
-- 1 つのチームを全員で共有する。members に有効な行があり、2 段階認証を済ませた
-- セッション（aal2）だけが読み書きでき、削除とメンバー管理は admin のみ。

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.project_kind as enum ('oss_research', 'client_engagement', 'internal');
create type public.project_status as enum ('planning', 'active', 'completed');
create type public.finding_severity as enum ('critical', 'high', 'medium', 'low', 'info');
create type public.finding_status as enum (
  'open', 'in_progress', 'fix_verifying', 'resolved', 'risk_accepted', 'false_positive'
);
create type public.verification_status as enum ('unverified', 'code_confirmed', 'reproduced');
create type public.report_status as enum (
  'not_reported', 'reported', 'accepted', 'fixed', 'disclosed', 'not_applicable'
);
create type public.finding_source as enum ('manual', 'trivy');
create type public.member_role as enum ('admin', 'member');

-- ---------------------------------------------------------------------------
-- テーブル
-- ---------------------------------------------------------------------------

create table public.members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique check (email = lower(email) and char_length(email) <= 320),
  role public.member_role not null default 'member',
  -- 無効にすると、発行済みのトークンでも次の問い合わせから読めなくなる。
  is_active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  client text check (char_length(client) <= 200),
  target text check (char_length(target) <= 2000),
  kind public.project_kind not null default 'client_engagement',
  status public.project_status not null default 'planning',
  start_date date,
  end_date date,
  notes text check (char_length(notes) <= 20000),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_dates_order check (end_date is null or start_date is null or end_date >= start_date)
);

create index projects_updated_idx on public.projects (updated_at desc);

-- 人が読む ID の連番。チーム全体で 1 つ。
-- 1 行のカウンター表は一括取り込みで同じ行の更新が積み重なり極端に遅くなるので、
-- シーケンスを使う。失敗した INSERT の分だけ番号が飛ぶことはある。
create sequence public.finding_seq as integer minvalue 1;

create table public.findings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  -- 採番はトリガーが必ず上書きする。クライアントの指定値は使わない。
  seq integer not null default 0 check (seq >= 0),
  -- 10000 件目以降も桁を切り詰めないよう、桁数に合わせて埋める。
  ref_id text generated always as (
    'PEN-' || lpad(seq::text, greatest(4, char_length(seq::text)), '0')
  ) stored,
  title text not null check (char_length(btrim(title)) between 1 and 1000),
  severity public.finding_severity not null default 'medium',
  status public.finding_status not null default 'open',
  verification_status public.verification_status not null default 'unverified',
  report_status public.report_status not null default 'not_reported',
  report_url text check (
    report_url is null or (report_url ~* '^https?://' and char_length(report_url) <= 2000)
  ),
  reported_on date,
  cve text check (char_length(cve) <= 100),
  cwe text check (char_length(cwe) <= 500),
  cvss_score numeric(3, 1) check (cvss_score between 0 and 10),
  cvss_vector text check (char_length(cvss_vector) <= 500),
  affected_location text check (char_length(affected_location) <= 4000),
  description text check (char_length(description) <= 200000),
  reproduction_steps text check (char_length(reproduction_steps) <= 200000),
  impact text check (char_length(impact) <= 200000),
  remediation text check (char_length(remediation) <= 200000),
  -- 手元で管理しているメモのファイル名や識別子。リンクにしない。
  local_reference text check (char_length(local_reference) <= 500),
  source public.finding_source not null default 'manual',
  -- Trivy 取り込みの重複判定キー。手入力の行では NULL。
  source_target text check (char_length(source_target) <= 2000),
  source_rule_id text check (char_length(source_rule_id) <= 500),
  source_package text check (char_length(source_package) <= 500),
  resolved_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint findings_seq_key unique (seq),
  constraint findings_trivy_key_present check (
    source <> 'trivy'
    or (source_target is not null and source_rule_id is not null and source_package is not null)
  )
);

create index findings_project_idx on public.findings (project_id);
create index findings_created_idx on public.findings (created_at desc);
create unique index findings_trivy_identity_idx
  on public.findings (project_id, source_target, source_rule_id, source_package)
  where source = 'trivy';

-- ---------------------------------------------------------------------------
-- トリガー
--
-- pg_trigger_depth() > 1 は外部キーの連鎖（ユーザー削除による set null など）で
-- 呼ばれた場合。このときは値を戻すと連鎖が失敗するので、何も変更しない。
-- ---------------------------------------------------------------------------

create function private.maintain_project_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.updated_by := auth.uid();
    return new;
  end if;
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

create trigger projects_maintain_fields
  before insert or update on public.projects
  for each row execute function private.maintain_project_fields();

-- 利用者がシーケンスを直接操作できないよう、採番だけ定義者権限で行う。
create function private.assign_finding_seq()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.seq := nextval('public.finding_seq');
  return new;
end;
$$;

create trigger findings_assign_seq
  before insert on public.findings
  for each row execute function private.assign_finding_seq();

create function private.maintain_finding_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.updated_by := auth.uid();
    new.resolved_at := case when new.status = 'resolved' then now() end;
    return new;
  end if;
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  -- 人が読む ID、取得元、作成者の情報は作成後に変えない。
  new.seq := old.seq;
  new.source := old.source;
  new.source_target := old.source_target;
  new.source_rule_id := old.source_rule_id;
  new.source_package := old.source_package;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.updated_by := auth.uid();
  new.updated_at := now();
  new.resolved_at := case
    when new.status <> 'resolved' then null
    when old.status = 'resolved' then old.resolved_at
    else now()
  end;
  return new;
end;
$$;

create trigger findings_maintain_fields
  before insert or update on public.findings
  for each row execute function private.maintain_finding_fields();

create function private.maintain_member_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    return new;
  end if;
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  new.user_id := old.user_id;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

create trigger members_maintain_fields
  before insert or update on public.members
  for each row execute function private.maintain_member_fields();

-- 有効な admin が 1 人もいない状態を作らせない。
create function private.keep_one_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;
  -- 2 人の admin が同時に互いを外しても、どちらかが必ず止まるよう直列化する。
  perform pg_advisory_xact_lock(hashtext('public.members.keep_one_admin'));
  if not exists (select 1 from public.members where role = 'admin' and is_active) then
    raise exception 'at least one active admin is required' using errcode = 'MO001';
  end if;
  return null;
end;
$$;

create trigger members_keep_one_admin
  after update or delete on public.members
  for each row execute function private.keep_one_admin();

-- ---------------------------------------------------------------------------
-- メンバーの判定。members 自身のポリシーからも使うので定義者権限で読む。
-- ---------------------------------------------------------------------------

create function private.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members m
    where m.user_id = auth.uid() and m.is_active
  );
$$;

create function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members m
    where m.user_id = auth.uid() and m.is_active and m.role = 'admin'
  );
$$;

revoke all on all functions in schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_member(), private.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- RLS と権限
-- ---------------------------------------------------------------------------

alter table public.members enable row level security;
alter table public.projects enable row level security;
alter table public.findings enable row level security;

revoke all on public.members, public.projects, public.findings from public, anon, authenticated;
-- 利用者向けの権限は持たせない。採番トリガーだけが使う。
revoke all on sequence public.finding_seq from public, anon, authenticated;
grant select, insert, update, delete on public.members, public.projects, public.findings to authenticated;

create policy members_select on public.members
  for select to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2' and (select private.is_member()));
create policy members_insert_admin on public.members
  for insert to authenticated
  with check ((select auth.jwt() ->> 'aal') = 'aal2' and (select private.is_admin()));
create policy members_update_admin on public.members
  for update to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2' and (select private.is_admin()))
  with check ((select auth.jwt() ->> 'aal') = 'aal2' and (select private.is_admin()));
create policy members_delete_admin on public.members
  for delete to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2' and (select private.is_admin()));

create policy projects_select on public.projects
  for select to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2' and (select private.is_member()));
create policy projects_insert on public.projects
  for insert to authenticated
  with check ((select auth.jwt() ->> 'aal') = 'aal2' and (select private.is_member()));
create policy projects_update on public.projects
  for update to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2' and (select private.is_member()))
  with check ((select auth.jwt() ->> 'aal') = 'aal2' and (select private.is_member()));
create policy projects_delete_admin on public.projects
  for delete to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2' and (select private.is_admin()));

create policy findings_select on public.findings
  for select to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2' and (select private.is_member()));
create policy findings_insert on public.findings
  for insert to authenticated
  with check ((select auth.jwt() ->> 'aal') = 'aal2' and (select private.is_member()));
create policy findings_update on public.findings
  for update to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2' and (select private.is_member()))
  with check ((select auth.jwt() ->> 'aal') = 'aal2' and (select private.is_member()));
create policy findings_delete_admin on public.findings
  for delete to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2' and (select private.is_admin()));

-- ---------------------------------------------------------------------------
-- Trivy 取り込み（1 トランザクションで一括登録）
-- ---------------------------------------------------------------------------

-- 呼び出し元の権限で動くので RLS がそのまま効く。
-- 再取り込みではスキャン由来の項目だけを更新し、ステータス・検証状況・報告状況、
-- 報告先、報告日、再現手順、影響、手元メモの参照には触れない。
create function public.import_trivy_findings(p_project_id uuid, p_items jsonb)
returns table (inserted integer, updated integer, skipped integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_total integer;
begin
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'p_items must be a JSON array' using errcode = '22023';
  end if;

  -- 行ロックで同じプロジェクトへの同時取り込みを直列化する。
  -- 非メンバーや aal1 のセッションには RLS で見えず、ここで止まる。
  perform 1 from public.projects where id = p_project_id for update;
  if not found then
    raise exception 'project not found' using errcode = 'P0002';
  end if;

  v_total := jsonb_array_length(p_items);

  return query
  with raw as (
    select *
    from jsonb_to_recordset(p_items) as x (
      title text,
      severity public.finding_severity,
      cve text,
      cwe text,
      cvss_score numeric,
      cvss_vector text,
      affected_location text,
      description text,
      remediation text,
      source_target text,
      source_rule_id text,
      source_package text
    )
  ),
  items as (
    select distinct on (source_target, source_rule_id, source_package) *
    from raw
    order by source_target, source_rule_id, source_package
  ),
  changed as (
    update public.findings f
    set title = i.title,
        severity = i.severity,
        cve = coalesce(i.cve, f.cve),
        cwe = coalesce(i.cwe, f.cwe),
        cvss_score = coalesce(i.cvss_score, f.cvss_score),
        cvss_vector = coalesce(i.cvss_vector, f.cvss_vector),
        affected_location = coalesce(i.affected_location, f.affected_location),
        description = coalesce(i.description, f.description),
        remediation = coalesce(i.remediation, f.remediation)
    from items i
    where f.project_id = p_project_id
      and f.source = 'trivy'
      and f.source_target = i.source_target
      and f.source_rule_id = i.source_rule_id
      and f.source_package = i.source_package
      and (
        f.title is distinct from i.title
        or f.severity is distinct from i.severity
        or f.cve is distinct from coalesce(i.cve, f.cve)
        or f.cwe is distinct from coalesce(i.cwe, f.cwe)
        or f.cvss_score is distinct from coalesce(i.cvss_score, f.cvss_score)
        or f.cvss_vector is distinct from coalesce(i.cvss_vector, f.cvss_vector)
        or f.affected_location is distinct from coalesce(i.affected_location, f.affected_location)
        or f.description is distinct from coalesce(i.description, f.description)
        or f.remediation is distinct from coalesce(i.remediation, f.remediation)
      )
    returning 1
  ),
  added as (
    insert into public.findings (
      project_id, title, severity, cve, cwe, cvss_score, cvss_vector,
      affected_location, description, remediation, source,
      source_target, source_rule_id, source_package
    )
    select
      p_project_id, i.title, i.severity, i.cve, i.cwe, i.cvss_score, i.cvss_vector,
      i.affected_location, i.description, i.remediation, 'trivy',
      i.source_target, i.source_rule_id, i.source_package
    from items i
    where not exists (
      select 1 from public.findings f
      where f.project_id = p_project_id
        and f.source = 'trivy'
        and f.source_target = i.source_target
        and f.source_rule_id = i.source_rule_id
        and f.source_package = i.source_package
    )
    order by i.source_target, i.source_rule_id, i.source_package
    returning 1
  )
  select
    (select count(*)::integer from added),
    (select count(*)::integer from changed),
    v_total - (select count(*)::integer from added) - (select count(*)::integer from changed);
end;
$$;

revoke all on function public.import_trivy_findings(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.import_trivy_findings(uuid, jsonb) to authenticated;
