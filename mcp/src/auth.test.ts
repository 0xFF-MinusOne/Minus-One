import { describe, expect, it, vi } from 'vitest';
import { BotAuthError, BotSession, jwtAal, type DbClient } from './auth';

const token = (aal: string) => `h.${Buffer.from(JSON.stringify({ aal })).toString('base64url')}.s`;
const credentials = { email: 'bot@example.test', password: 'p', totpSecret: 'JBSWY3DPEHPK3PXP' };
const config = { url: 'http://127.0.0.1:1', publicKey: 'k' };

function fakeClient(options: { sessions: Array<string | null>; signInError?: boolean; verifyError?: boolean }) {
  const sessions = [...options.sessions];
  const auth = {
    getSession: vi.fn(async () => {
      const current = sessions.length > 1 ? sessions.shift() : sessions[0];
      return { data: { session: current ? { access_token: current } : null }, error: null };
    }),
    signInWithPassword: vi.fn(async () => ({ error: options.signInError ? { status: 400 } : null })),
    mfa: {
      listFactors: vi.fn(async () => ({ data: { totp: [{ id: 'f' }] }, error: null })),
      challengeAndVerify: vi.fn(async () => ({ error: options.verifyError ? { status: 422 } : null })),
    },
    stopAutoRefresh: vi.fn(),
  };
  return { auth, client: { auth } as unknown as DbClient };
}

describe('BotSession', () => {
  it('aal2 のセッションがあればログインしない', async () => {
    const { auth, client } = fakeClient({ sessions: [token('aal2')] });
    await new BotSession(config, credentials, client).ensureAal2();
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('セッションが無ければ、パスワードと TOTP で aal2 にする', async () => {
    const { auth, client } = fakeClient({ sessions: [null, token('aal2')] });
    await new BotSession(config, credentials, client).ensureAal2();
    expect(auth.signInWithPassword).toHaveBeenCalledOnce();
    expect(auth.mfa.challengeAndVerify).toHaveBeenCalledOnce();
  });

  it('更新で aal1 に落ちたらログインし直す', async () => {
    const { auth, client } = fakeClient({ sessions: [token('aal1'), token('aal2')] });
    await new BotSession(config, credentials, client).ensureAal2();
    expect(auth.signInWithPassword).toHaveBeenCalledOnce();
  });

  it('同時の呼び出しでログインは 1 回だけ', async () => {
    const { auth, client } = fakeClient({ sessions: [null, token('aal2')] });
    const session = new BotSession(config, credentials, client);
    await Promise.all([session.ensureAal2(), session.ensureAal2()]);
    expect(auth.signInWithPassword).toHaveBeenCalledOnce();
  });

  it.each([
    ['パスワードの失敗', { sessions: [null], signInError: true }],
    ['TOTP の失敗', { sessions: [null], verifyError: true }],
    ['確認後も aal2 にならない', { sessions: [null, token('aal1')] }],
  ])('%s は決まったエラーになり、秘密を含まない', async (_label, options) => {
    const { client } = fakeClient(options);
    const error = await new BotSession(config, credentials, client).ensureAal2().catch((cause: Error) => cause);
    expect(error).toBeInstanceOf(BotAuthError);
    expect((error as Error).message).not.toContain(credentials.password);
    expect((error as Error).message).not.toContain(credentials.totpSecret);
  });
});

describe('jwtAal', () => {
  it('壊れたトークンでは null', () => {
    expect(jwtAal(token('aal2'))).toBe('aal2');
    expect(jwtAal('broken')).toBeNull();
  });
});
