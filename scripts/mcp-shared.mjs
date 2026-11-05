// MCP サーバーとボットの作成スクリプトで共有する処理。
// キーチェーンへの書き込みは `security -i` に標準入力でコマンドを渡す。
// 引数に秘密を置かないので、ps には表示されない。
import { execFile, spawn } from 'node:child_process';

const SECURITY = '/usr/bin/security';
const ACCOUNT = 'bot';
const SERVICE_PREFIX = 'pentest-dashboard-mcp';

/** 公開キーだけを許可する。service_role や sb_secret_ などは通さない。値はエラーに出さない。 */
export function isPublicSupabaseKey(key) {
  if (typeof key !== 'string' || key === '') return false;
  if (key.startsWith('sb_publishable_')) return true;
  if (key.startsWith('sb_')) return false;
  const parts = key.split('.');
  if (parts.length !== 3) return false;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')).role === 'anon';
  } catch {
    return false;
  }
}

/** 接続先の URL を確かめて origin を返す。http はこの Mac の中の接続だけ許可する。 */
export function normalizeSupabaseUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Supabase の URL の形式が正しくありません。');
  }
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error('Supabase の URL は https（ローカルのみ http）にしてください。');
  }
  if (url.username || url.password) throw new Error('Supabase の URL に認証情報を含めないでください。');
  return url.origin;
}

/** キーチェーンのサービス名。接続先ごとに分ける。 */
export function keychainServiceFor(url) {
  return `${SERVICE_PREFIX}/${new URL(normalizeSupabaseUrl(url)).host}`;
}

function runSecurity(args) {
  return new Promise((resolve) => {
    execFile(SECURITY, args, { timeout: 60_000, maxBuffer: 1024 * 1024 }, (error, stdout) => {
      resolve({ ok: !error, stdout: error ? '' : stdout });
    });
  });
}

function encode(credentials) {
  return Buffer.from(JSON.stringify(credentials), 'utf8').toString('base64url');
}

function decode(value) {
  const parsed = JSON.parse(Buffer.from(value.trim(), 'base64url').toString('utf8'));
  if (
    typeof parsed.email !== 'string' ||
    typeof parsed.password !== 'string' ||
    typeof parsed.totpSecret !== 'string'
  ) {
    throw new Error('invalid');
  }
  return parsed;
}

export async function botCredentialsExist(service) {
  return (await runSecurity(['find-generic-password', '-s', service, '-a', ACCOUNT])).ok;
}

export async function readBotCredentials(service) {
  const { ok, stdout } = await runSecurity(['find-generic-password', '-s', service, '-a', ACCOUNT, '-w']);
  if (!ok) return null;
  try {
    return decode(stdout);
  } catch {
    return null;
  }
}

/** 既にある項目は上書きしない。書き込み後に読み戻して確かめる。 */
export async function saveBotCredentials(service, credentials) {
  if (!/^[A-Za-z0-9._:/\[\]-]+$/.test(service)) throw new Error('キーチェーンのサービス名が正しくありません。');
  const child = spawn(SECURITY, ['-i'], { stdio: ['pipe', 'ignore', 'ignore'] });
  const finished = new Promise((resolve, reject) => {
    child.once('error', () => reject(new Error('security を起動できませんでした。')));
    child.once('close', resolve);
  });
  child.stdin.on('error', () => undefined);
  // base64url なので、空白や引用符を含まない。
  child.stdin.end(`add-generic-password -a ${ACCOUNT} -s ${service} -w ${encode(credentials)}\n`);
  await finished;

  const stored = await readBotCredentials(service);
  if (
    !stored ||
    stored.email !== credentials.email ||
    stored.password !== credentials.password ||
    stored.totpSecret !== credentials.totpSecret
  ) {
    throw new Error('キーチェーンに保存できませんでした。');
  }
}

export async function deleteBotCredentials(service) {
  return (await runSecurity(['delete-generic-password', '-s', service, '-a', ACCOUNT])).ok;
}
