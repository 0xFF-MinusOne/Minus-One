// ローカル開発の準備（ローカルの Supabase 専用）。
// .env.local を書き、開発用の管理者を作って 2 段階認証まで登録する。
// パスワードと TOTP の秘密鍵は .dev-login.local にだけ書き、画面には出さない。
// もう一度実行すると、パスワードと秘密鍵を作り直す。
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { readLocalSupabase } from './local-supabase.mjs';
import { generateTotp } from './totp.mjs';

const EMAIL = 'admin@pentest-dashboard.test';
const { url, anonKey, serviceRoleKey } = readLocalSupabase();
const options = { auth: { autoRefreshToken: false, persistSession: false } };

writeFileSync('.env.local', `VITE_SUPABASE_URL=${url}\nVITE_SUPABASE_ANON_KEY=${anonKey}\n`, { mode: 0o600 });

const admin = createClient(url, serviceRoleKey, options);
const password = randomBytes(18).toString('base64url');

const { data: list, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (listError) throw new Error(listError.message);
const existing = list.users.find((user) => user.email === EMAIL);

let userId;
if (existing) {
  userId = existing.id;
  const { error } = await admin.auth.admin.updateUserById(userId, { password, ban_duration: 'none' });
  if (error) throw new Error(error.message);
  const factors = await admin.auth.admin.mfa.listFactors({ userId });
  if (factors.error) throw new Error(factors.error.message);
  for (const factor of factors.data.factors) {
    const removed = await admin.auth.admin.mfa.deleteFactor({ id: factor.id, userId });
    if (removed.error) throw new Error(removed.error.message);
  }
} else {
  const { data, error } = await admin.auth.admin.createUser({ email: EMAIL, password, email_confirm: true });
  if (error) throw new Error(error.message);
  userId = data.user.id;
}

const member = await admin
  .from('members')
  .upsert({ user_id: userId, email: EMAIL, role: 'admin', is_active: true }, { onConflict: 'user_id' });
if (member.error) throw new Error(member.error.message);

const client = createClient(url, anonKey, options);
const signIn = await client.auth.signInWithPassword({ email: EMAIL, password });
if (signIn.error) throw new Error(signIn.error.message);
const enroll = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Pentest Dashboard (dev)' });
if (enroll.error) throw new Error(enroll.error.message);
const totpSecret = enroll.data.totp.secret;
const verified = await client.auth.mfa.challengeAndVerify({
  factorId: enroll.data.id,
  code: generateTotp(totpSecret),
});
if (verified.error) throw new Error(verified.error.message);
await client.auth.signOut({ scope: 'local' });

writeFileSync(
  '.dev-login.local',
  `email=${EMAIL}\npassword=${password}\ntotp_secret=${totpSecret}\n`,
  { mode: 0o600 },
);
console.log(`${existing ? '更新' : '作成'}しました: ${EMAIL}（ログイン情報は .dev-login.local）`);
