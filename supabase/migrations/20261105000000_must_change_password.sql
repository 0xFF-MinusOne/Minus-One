-- 招待された人の初回パスワード変更。
-- 印は members に持つ。members は admin しか更新できないので、本人は書き換えられない。
alter table public.members
  add column must_change_password boolean not null default false;

-- 解除は「パスワードが実際に変わったとき」だけ DB が行う。
-- 利用者が呼べる解除用の API を置かないので、変更せずに印だけ消すことはできない。
create function private.clear_must_change_password()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.members
  set must_change_password = false, updated_at = now()
  where user_id = new.id and must_change_password;
  return null;
end;
$$;

revoke all on function private.clear_must_change_password() from public, anon, authenticated;

create trigger on_password_changed_clear_flag
  after update of encrypted_password on auth.users
  for each row
  when (old.encrypted_password is distinct from new.encrypted_password)
  execute function private.clear_must_change_password();
