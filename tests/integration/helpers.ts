import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/lib/database.types';
// @ts-expect-error 型定義のない開発用スクリプト
import { readLocalSupabase } from '../../scripts/local-supabase.mjs';
import { generateTotp } from '../../scripts/totp.mjs';

export const local = readLocalSupabase() as { url: string; anonKey: string; serviceRoleKey: string; dbUrl: string };

const options = { auth: { autoRefreshToken: false, persistSession: false } };

export const newClient = () => createClient<Database>(local.url, local.anonKey, options);
export const admin = createClient<Database>(local.url, local.serviceRoleKey, options);
export const anon = newClient();
export const totp = generateTotp as (secret: string, nowMs?: number) => string;

export interface TempUser {
  id: string;
  email: string;
  password: string;
  totpSecret: string;
  factorId: string;
  /** 2 段階認証を済ませた aal2 のセッション。 */
  client: SupabaseClient<Database>;
}

const created: string[] = [];
let sequenceBefore: { last: number; called: boolean } | null = null;

/** テスト用の直接の SQL。シーケンスは REST から触れないので psql を使う。 */
export function sql(query: string): string {
  const url = new URL(local.dbUrl);
  return execFileSync('psql', ['--no-psqlrc', '-At', '-v', 'ON_ERROR_STOP=1', '-c', query], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PGHOST: url.hostname,
      PGPORT: url.port,
      PGUSER: decodeURIComponent(url.username),
      PGPASSWORD: decodeURIComponent(url.password),
      PGDATABASE: url.pathname.slice(1),
    },
  }).trim();
}

function readSequence(): { last: number; called: boolean } {
  const [last, called] = sql('select last_value, is_called from public.finding_seq').split('|');
  return { last: Number(last), called: called === 't' };
}

export function setSequence(last: number, called = true): void {
  sql(`select setval('public.finding_seq', ${last}, ${called})`);
}

export function rememberCounter(): void {
  sequenceBefore = readSequence();
}

/** ここまでに使った最後の番号（未使用なら 0）。 */
export function currentCounter(): number {
  const { last, called } = readSequence();
  return called ? last : 0;
}

export async function signInPassword(user: Pick<TempUser, 'email' | 'password'>) {
  const client = newClient();
  const { error } = await withRetry(() =>
    client.auth.signInWithPassword({ email: user.email, password: user.password }),
  );
  if (error) throw error;
  return client;
}

/** パスワードだけのログイン。2 段階認証の前なので aal1 のまま。 */
export const signInAal1 = signInPassword;

export function jwtAal(token: string | undefined): string | undefined {
  if (!token) return undefined;
  const payload = token.split('.')[1] ?? '';
  return (JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { aal?: string }).aal;
}

/** マシンが混んでいると Auth が一時的に時間切れを返すので、その場合だけやり直す。 */
export async function withRetry<T extends { error: { status?: number } | null }>(run: () => Promise<T>): Promise<T> {
  let result = await run();
  for (let attempt = 0; attempt < 3 && result.error && (result.error.status ?? 500) >= 500; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    result = await run();
  }
  return result;
}

export async function createTempUser(label: string, role: 'admin' | 'member' | null): Promise<TempUser> {
  const email = `tmp-${label}-${randomBytes(6).toString('hex')}@pentest-dashboard.test`;
  const password = randomBytes(24).toString('base64url');
  const { data, error } = await withRetry(() => admin.auth.admin.createUser({ email, password, email_confirm: true }));
  if (error || !data.user) throw error ?? new Error('ユーザーを作れませんでした');
  created.push(data.user.id);
  if (role) {
    const member = await admin.from('members').insert({ user_id: data.user.id, email, role });
    if (member.error) throw member.error;
  }
  const client = await signInPassword({ email, password });
  const enroll = await withRetry(() =>
    client.auth.mfa.enroll({ factorType: 'totp', friendlyName: `test-${randomBytes(4).toString('hex')}` }),
  );
  if (enroll.error) throw enroll.error;
  const verified = await withRetry(() =>
    client.auth.mfa.challengeAndVerify({ factorId: enroll.data.id, code: totp(enroll.data.totp.secret) }),
  );
  if (verified.error) throw verified.error;
  return {
    id: data.user.id,
    email,
    password,
    totpSecret: enroll.data.totp.secret,
    factorId: enroll.data.id,
    client,
  };
}

export function trackUser(id: string): void {
  created.push(id);
}

/** 一時ユーザーとその作ったデータを消し、採番を元に戻す。 */
export async function cleanup(): Promise<void> {
  const ids = created.splice(0);
  if (ids.length > 0) {
    const projects = await admin.from('projects').delete().in('created_by', ids);
    if (projects.error) throw projects.error;
    for (const id of ids) {
      const { error } = await admin.auth.admin.deleteUser(id);
      // テストの中で既に消したユーザーは飛ばす。
      if (error && error.code !== 'user_not_found' && error.status !== 404) throw error;
    }
  }
  if (sequenceBefore) {
    setSequence(sequenceBefore.last, sequenceBefore.called);
    sequenceBefore = null;
  }
}
