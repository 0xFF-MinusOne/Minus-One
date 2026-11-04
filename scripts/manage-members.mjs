#!/usr/bin/env node
// メンバーの管理。接続先とキーは環境変数からだけ読む。
//
//   SUPABASE_URL                接続先の URL
//   SUPABASE_SERVICE_ROLE_KEY   service_role キー（引数には渡さない）
//
//   node scripts/manage-members.mjs invite <email> [--role admin|member]
//   node scripts/manage-members.mjs reset-mfa <email>
//   node scripts/manage-members.mjs disable <email>
//   node scripts/manage-members.mjs enable <email>
//
// invite の初期パスワードは標準出力に一度だけ表示し、どこにも保存しない。
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const USAGE = `使い方:
  node scripts/manage-members.mjs invite <email> [--role admin|member]
  node scripts/manage-members.mjs reset-mfa <email>
  node scripts/manage-members.mjs disable <email>
  node scripts/manage-members.mjs enable <email>`;

const BAN_DURATION = '876000h'; // 約 100 年

function fail(message) {
  console.error(message);
  process.exit(1);
}

function connect() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) fail('環境変数 SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を設定してください。');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/** Auth が混雑で 5xx を返したときだけ、やり直す。同じ指定で繰り返しても結果が変わらない操作に使う。 */
async function withRetry(run) {
  let result = await run();
  for (let attempt = 0; attempt < 3 && result.error && (result.error.status ?? 500) >= 500; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    result = await run();
  }
  return result;
}

async function findMember(admin, email) {
  const { data, error } = await admin.from('members').select('user_id,email,role,is_active').eq('email', email).maybeSingle();
  if (error) fail(`メンバーを読めませんでした: ${error.message}`);
  if (!data) fail(`メンバーが見つかりません: ${email}`);
  return data;
}

async function invite(admin, email, role) {
  const password = randomBytes(24).toString('base64url');
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) fail(`ユーザーを作れませんでした: ${error.message}`);

  const member = await admin
    .from('members')
    .insert({ user_id: data.user.id, email, role, must_change_password: true });
  if (member.error) {
    // members に入らなかったユーザーを残さない。
    await admin.auth.admin.deleteUser(data.user.id);
    fail(`メンバーに登録できませんでした: ${member.error.message}`);
  }
  console.log(`追加しました: ${email}（${role}）`);
  console.log(`初期パスワード: ${password}`);
  console.log('この表示は一度だけです。安全な方法で本人に渡してください。初回ログインで 2 段階認証の登録とパスワードの変更を行います。');
}

async function resetMfa(admin, email) {
  const { user_id: userId } = await findMember(admin, email);
  const factors = await admin.auth.admin.mfa.listFactors({ userId });
  if (factors.error) fail(`2 段階認証を読めませんでした: ${factors.error.message}`);
  for (const factor of factors.data.factors) {
    const removed = await admin.auth.admin.mfa.deleteFactor({ id: factor.id, userId });
    if (removed.error) fail(`2 段階認証を消せませんでした: ${removed.error.message}`);
  }
  console.log(`リセットしました: ${email}（次回ログインで登録し直します）`);
}

async function disable(admin, email) {
  const { user_id: userId } = await findMember(admin, email);
  // 先に members を止める。発行済みのトークンでも RLS で読めなくなる。
  const updated = await admin.from('members').update({ is_active: false }).eq('user_id', userId);
  if (updated.error) fail(`無効にできませんでした: ${updated.error.message}`);
  const banned = await withRetry(() => admin.auth.admin.updateUserById(userId, { ban_duration: BAN_DURATION }));
  if (banned.error) fail(`ログインを止められませんでした: ${banned.error.message}`);
  console.log(`無効にしました: ${email}`);
}

async function enable(admin, email) {
  const { user_id: userId } = await findMember(admin, email);
  const unbanned = await withRetry(() => admin.auth.admin.updateUserById(userId, { ban_duration: 'none' }));
  if (unbanned.error) fail(`ログインを戻せませんでした: ${unbanned.error.message}`);
  const updated = await admin.from('members').update({ is_active: true }).eq('user_id', userId);
  if (updated.error) fail(`有効にできませんでした: ${updated.error.message}`);
  console.log(`有効にしました: ${email}`);
}

const [command, rawEmail, ...rest] = process.argv.slice(2);
const email = rawEmail?.trim().toLowerCase();
if (!command || !email || !email.includes('@')) fail(USAGE);

switch (command) {
  case 'invite': {
    const roleIndex = rest.indexOf('--role');
    const role = roleIndex >= 0 ? rest[roleIndex + 1] : 'member';
    if (role !== 'admin' && role !== 'member') fail('--role は admin か member を指定してください。');
    await invite(connect(), email, role);
    break;
  }
  case 'reset-mfa':
    await resetMfa(connect(), email);
    break;
  case 'disable':
    await disable(connect(), email);
    break;
  case 'enable':
    await enable(connect(), email);
    break;
  default:
    fail(USAGE);
}
