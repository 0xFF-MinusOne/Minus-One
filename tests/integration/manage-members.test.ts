import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, cleanup, createTempUser, local, newClient, rememberCounter, signInAal1, totp, trackUser, withRetry } from './helpers';

const run = promisify(execFile);
const script = new URL('../../scripts/manage-members.mjs', import.meta.url).pathname;

function manage(...args: string[]) {
  return run('node', [script, ...args], {
    env: { ...process.env, SUPABASE_URL: local.url, SUPABASE_SERVICE_ROLE_KEY: local.serviceRoleKey },
  });
}

const email = `tmp-invite-${randomBytes(6).toString('hex')}@pentest-dashboard.test`;
let password = '';
let userId = '';

beforeAll(() => rememberCounter());
afterAll(cleanup);

describe('scripts/manage-members.mjs', () => {
  it('キーが無ければ動かない', async () => {
    await expect(
      run('node', [script, 'invite', email], { env: { ...process.env, SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '' } }),
    ).rejects.toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('invite は初期パスワードを一度だけ表示し、キーを出さない', async () => {
    const { stdout, stderr } = await manage('invite', email, '--role', 'member');
    expect(stdout + stderr).not.toContain(local.serviceRoleKey);
    const matches = [...stdout.matchAll(/初期パスワード: (\S+)/g)];
    expect(matches).toHaveLength(1);
    password = matches[0]?.[1] ?? '';
    expect(password.length).toBeGreaterThanOrEqual(24);

    const member = await admin.from('members').select('user_id,role,is_active').eq('email', email).single();
    expect(member.data).toMatchObject({ role: 'member', is_active: true });
    userId = member.data?.user_id ?? '';
    trackUser(userId);
  });

  it('招待された人はパスワードだけでは読めず、2 段階認証の後で読める', async () => {
    const seed = await createTempUser('seed', 'member');
    await seed.client.from('projects').insert({ name: '招待の確認' });

    const client = await signInAal1({ email, password });
    expect((await client.from('projects').select('id')).data).toEqual([]);
    const enroll = await withRetry(() =>
      client.auth.mfa.enroll({ factorType: 'totp', friendlyName: `invite-${randomBytes(4).toString('hex')}` }),
    );
    if (enroll.error) throw enroll.error;
    const verified = await withRetry(() =>
      client.auth.mfa.challengeAndVerify({ factorId: enroll.data.id, code: totp(enroll.data.totp.secret) }),
    );
    expect(verified.error).toBeNull();
    expect((await client.from('projects').select('id')).data?.length).toBeGreaterThan(0);
  });

  it('reset-mfa で登録が消え、もう一度登録できる', async () => {
    await manage('reset-mfa', email);
    const factors = await admin.auth.admin.mfa.listFactors({ userId });
    expect(factors.data?.factors).toEqual([]);
    const client = await signInAal1({ email, password });
    const enroll = await withRetry(() =>
      client.auth.mfa.enroll({ factorType: 'totp', friendlyName: `again-${randomBytes(4).toString('hex')}` }),
    );
    expect(enroll.error).toBeNull();
  });

  it('disable でログインできなくなり、enable で戻る', async () => {
    await manage('disable', email);
    const member = await admin.from('members').select('is_active').eq('user_id', userId).single();
    expect(member.data?.is_active).toBe(false);
    const client = newClient();
    const blocked = await client.auth.signInWithPassword({ email, password });
    expect(blocked.error).not.toBeNull();

    await manage('enable', email);
    const restored = await client.auth.signInWithPassword({ email, password });
    expect(restored.error).toBeNull();
  });

  it('同じメールの二重招待は失敗し、存在しないメンバーの操作も失敗する', async () => {
    await expect(manage('invite', email)).rejects.toThrow();
    await expect(manage('disable', 'nobody@pentest-dashboard.test')).rejects.toThrow(/見つかりません/);
  });
});

describe('初回のパスワード変更', () => {
  const invited = `tmp-pw-${randomBytes(6).toString('hex')}@pentest-dashboard.test`;
  let initial = '';
  let id = '';
  let secret = '';
  let factorId = '';
  const newPassword = randomBytes(24).toString('base64url');

  const flag = async () =>
    (await admin.from('members').select('must_change_password').eq('user_id', id).single()).data?.must_change_password;

  async function signInAal2(pass: string) {
    const client = await signInAal1({ email: invited, password: pass });
    const verified = await withRetry(() => client.auth.mfa.challengeAndVerify({ factorId, code: totp(secret) }));
    expect(verified.error).toBeNull();
    return client;
  }

  it('招待すると変更必須の印が付く', async () => {
    const { stdout } = await manage('invite', invited);
    initial = /初期パスワード: (\S+)/.exec(stdout)?.[1] ?? '';
    const member = await admin.from('members').select('user_id,must_change_password').eq('email', invited).single();
    id = member.data?.user_id ?? '';
    trackUser(id);
    expect(member.data?.must_change_password).toBe(true);

    const client = await signInAal1({ email: invited, password: initial });
    const enroll = await withRetry(() =>
      client.auth.mfa.enroll({ factorType: 'totp', friendlyName: `pw-${randomBytes(4).toString('hex')}` }),
    );
    if (enroll.error) throw enroll.error;
    secret = enroll.data.totp.secret;
    factorId = enroll.data.id;
    const verified = await withRetry(() => client.auth.mfa.challengeAndVerify({ factorId, code: totp(secret) }));
    expect(verified.error).toBeNull();
  });

  it('本人は印を消せない', async () => {
    const client = await signInAal2(initial);
    const update = await client.from('members').update({ must_change_password: false }).eq('user_id', id).select();
    expect(update.data).toEqual([]);
    expect(await flag()).toBe(true);
    // app_metadata や user_metadata を変えても、判定には関係しない。
    await client.auth.updateUser({ data: { must_change_password: false } });
    expect(await flag()).toBe(true);
  });

  it('aal1 のセッションではパスワードを変更できない', async () => {
    const client = await signInAal1({ email: invited, password: initial });
    const { error } = await client.auth.updateUser({ password: newPassword });
    expect(error?.code).toBe('insufficient_aal');
    expect(await flag()).toBe(true);
  });

  it('短いパスワードと同じパスワードは拒否され、印は残る', async () => {
    const client = await signInAal2(initial);
    const short = await client.auth.updateUser({ password: 'short-pass' });
    expect(short.error?.code).toBe('weak_password');
    const same = await client.auth.updateUser({ password: initial });
    expect(same.error?.code).toBe('same_password');
    expect(await flag()).toBe(true);
  });

  it('変更すると印が消え、セッションは aal2 のまま読める', async () => {
    const seed = await createTempUser('pw-seed', 'member');
    await seed.client.from('projects').insert({ name: 'パスワード変更の確認' });

    const client = await signInAal2(initial);
    const { error } = await withRetry(() => client.auth.updateUser({ password: newPassword }));
    expect(error).toBeNull();
    expect(await flag()).toBe(false);
    expect((await client.from('projects').select('id')).data?.length).toBeGreaterThan(0);
  });

  it('古いパスワードは使えず、新しいパスワードで入れる', async () => {
    const blocked = await newClient().auth.signInWithPassword({ email: invited, password: initial });
    expect(blocked.error).not.toBeNull();
    const client = await signInAal1({ email: invited, password: newPassword });
    expect((await client.auth.getUser()).data.user?.id).toBe(id);
  });

  it('印の無いメンバーがパスワードを変えても、ほかの人の印は変わらない', async () => {
    const other = await createTempUser('pw-other', 'member');
    await admin.from('members').update({ must_change_password: true }).eq('user_id', id);
    const { error } = await withRetry(() => other.client.auth.updateUser({ password: randomBytes(24).toString('base64url') }));
    expect(error).toBeNull();
    expect(await flag()).toBe(true);
  });
});
