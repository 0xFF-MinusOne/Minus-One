#!/usr/bin/env node
// MCP サーバーが使うボットを作り、ログイン情報をキーチェーンに保存する。
// パスワードと TOTP の秘密鍵は画面にもファイルにも出さない。
//
//   SUPABASE_URL                接続先の URL
//   SUPABASE_SERVICE_ROLE_KEY   service_role キー（ユーザーの作成にだけ使う）
//   SUPABASE_PUBLIC_KEY         公開キー（ボットとしてログインするのに使う）
//
//   node scripts/setup-mcp-bot.mjs <メールのドメイン>
//
// mcp-bot@<ドメイン> を role = member で作る。既にあれば何も変えずに中止する。
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import {
  botCredentialsExist,
  deleteBotCredentials,
  isPublicSupabaseKey,
  keychainServiceFor,
  normalizeSupabaseUrl,
  saveBotCredentials,
} from './mcp-shared.mjs';
import { generateTotp } from './totp.mjs';

function fail(message) {
  console.error(message);
  process.exit(1);
}

/** エラーに秘密が混ざらないよう、理由の種類だけを表示する。 */
function reason(error) {
  return error?.code ?? error?.status ?? '不明';
}

async function findUserByEmail(admin, email) {
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) fail(`ユーザーを読めませんでした（${reason(error)}）。`);
    const found = data.users.find((user) => user.email === email);
    if (found) return found;
    if (data.users.length < 200) return null;
  }
}

async function main() {
  const domain = process.argv[2]?.trim().toLowerCase();
  if (!domain || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) {
    fail('使い方: node scripts/setup-mcp-bot.mjs <メールのドメイン>');
  }
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_PUBLIC_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_PUBLIC_KEY) {
    fail('環境変数 SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY、SUPABASE_PUBLIC_KEY を設定してください。');
  }
  if (!isPublicSupabaseKey(SUPABASE_PUBLIC_KEY)) fail('SUPABASE_PUBLIC_KEY には公開キーを指定してください。');

  const url = normalizeSupabaseUrl(SUPABASE_URL);
  const service = keychainServiceFor(url);
  const email = `mcp-bot@${domain}`;
  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  const admin = createClient(url, SUPABASE_SERVICE_ROLE_KEY, options);

  if (await botCredentialsExist(service)) fail(`キーチェーンに既にあります（${service}）。中止しました。`);
  if (await findUserByEmail(admin, email)) fail(`ユーザーが既にあります（${email}）。中止しました。`);

  const password = randomBytes(32).toString('base64url');
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) fail(`ユーザーを作れませんでした（${reason(created.error)}）。`);
  const userId = created.data.user.id;
  let saved = false;

  try {
    // 招待と違い、人がパスワードを変える場面がないので変更必須の印は付けない。
    const member = await admin
      .from('members')
      .insert({ user_id: userId, email, role: 'member', must_change_password: false });
    if (member.error) throw new Error(`メンバーに登録できませんでした（${reason(member.error)}）。`);

    const client = createClient(url, SUPABASE_PUBLIC_KEY, options);
    const signIn = await client.auth.signInWithPassword({ email, password });
    if (signIn.error) throw new Error(`ログインできませんでした（${reason(signIn.error)}）。`);
    const enroll = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'mcp-bot' });
    if (enroll.error) throw new Error(`2 段階認証を登録できませんでした（${reason(enroll.error)}）。`);
    const totpSecret = enroll.data.totp.secret;
    const verified = await client.auth.mfa.challengeAndVerify({
      factorId: enroll.data.id,
      code: generateTotp(totpSecret),
    });
    if (verified.error) throw new Error(`2 段階認証を確認できませんでした（${reason(verified.error)}）。`);
    await client.auth.signOut({ scope: 'local' });

    await saveBotCredentials(service, { email, password, totpSecret });
    saved = true;
  } catch (error) {
    // 途中まで作ったものを残さない。
    if (saved) await deleteBotCredentials(service);
    await admin.auth.admin.deleteUser(userId);
    fail(error instanceof Error ? error.message : 'ボットを作れませんでした。');
  }

  console.log(`作成しました: ${email}（role = member）`);
  console.log(`ログイン情報はキーチェーンに保存しました: ${service}`);
}

main().catch(() => fail('ボットを作れませんでした。'));
