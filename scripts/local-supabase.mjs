import { execFileSync } from 'node:child_process';

/** `supabase status` からローカルの接続情報を読む。キーはコードに書かない。 */
export function readLocalSupabase() {
  const raw = execFileSync('supabase', ['status', '-o', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const status = JSON.parse(raw);
  const { API_URL: url, ANON_KEY: anonKey, SERVICE_ROLE_KEY: serviceRoleKey, DB_URL: dbUrl } = status;
  if (!url || !anonKey || !serviceRoleKey) {
    throw new Error('supabase status から接続情報を読めませんでした。supabase start を実行してください。');
  }
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url)) {
    throw new Error(`ローカル以外の Supabase には接続しません: ${url}`);
  }
  return { url, anonKey, serviceRoleKey, dbUrl };
}
