import { describe, expect, it, vi } from 'vitest';
import { freshAccessToken, ghostwriterHubLoginEndpoint, safeGhostwriterNext, submitHubLogin, type SessionSource } from './ghostwriterSso';

const NOW = 1_800_000_000_000;

function source(expiresInSeconds: number | undefined, refreshed: string | null = 'new-token', refreshError: unknown = null) {
  const expires_at = expiresInSeconds === undefined ? undefined : NOW / 1000 + expiresInSeconds;
  const auth: SessionSource = {
    getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'old-token', expires_at } }, error: null }),
    refreshSession: vi.fn().mockResolvedValue({
      data: { session: refreshed ? { access_token: refreshed } : null },
      error: refreshError,
    }),
  };
  return auth;
}

describe('ghostwriterHubLoginEndpoint', () => {
  it.each([
    ['/redteam/', '/redteam/accounts/hub-login/'],
    ['https://gw.example.com/', 'https://gw.example.com/accounts/hub-login/'],
    ['https://gw.example.com/app', 'https://gw.example.com/app/accounts/hub-login/'],
  ])('%s', (base, expected) => {
    expect(ghostwriterHubLoginEndpoint(base)).toBe(expected);
  });
});

describe('safeGhostwriterNext', () => {
  it('パスだけを通す', () => {
    expect(safeGhostwriterNext('/redteam/rolodex/?a=1')).toBe('/redteam/rolodex/?a=1');
  });
  it.each([null, '', 'https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)'])('拒否する: %j', (value) => {
    expect(safeGhostwriterNext(value)).toBeUndefined();
  });
});

describe('freshAccessToken', () => {
  it('期限まで余裕があれば更新しない', async () => {
    const auth = source(600);
    await expect(freshAccessToken(auth, NOW)).resolves.toBe('old-token');
    expect(auth.refreshSession).not.toHaveBeenCalled();
  });

  it.each([60, 0, -10, undefined])('期限が近いか不明なら更新する: %j', async (seconds) => {
    await expect(freshAccessToken(source(seconds), NOW)).resolves.toBe('new-token');
  });

  it('更新に失敗したら古いトークンを送らず、エラーにトークンを含めない', async () => {
    const failed = freshAccessToken(source(10, null, new Error('refresh failed')), NOW);
    await expect(failed).rejects.toThrow('セッションを更新できませんでした。');
    await expect(failed).rejects.not.toThrow('old-token');
  });

  it('セッションがなければ失敗する', async () => {
    const auth = source(600);
    auth.getSession = vi.fn().mockResolvedValue({ data: { session: null }, error: null });
    await expect(freshAccessToken(auth, NOW)).rejects.toThrow();
  });
});

describe('submitHubLogin', () => {
  /** テストは node で動くので、使う分だけの document を用意する。 */
  function fakeDocument() {
    const created: Array<Record<string, any>> = [];
    const element = (tag: string) => {
      const node: Record<string, any> = {
        tag, children: [], append(child: unknown) { node.children.push(child); },
        submit: vi.fn(), remove: vi.fn(),
      };
      created.push(node);
      return node;
    };
    const head = element('head');
    const body = element('body');
    return { doc: { createElement: element, head, body } as unknown as Document, head, body };
  }

  it('POST でトークンを本文に入れ、Origin を送る設定にして、送信後にフォームを消す', () => {
    const { doc, head, body } = fakeDocument();
    submitHubLogin(doc, '/redteam/accounts/hub-login/', 'secret-token', '/redteam/rolodex/');

    expect(head.children[0]).toMatchObject({ tag: 'meta', name: 'referrer', content: 'strict-origin' });
    const form = body.children[0];
    expect(form).toMatchObject({ method: 'post', action: '/redteam/accounts/hub-login/', hidden: true });
    expect(form.action).not.toContain('secret-token');
    expect(form.children.map((input: any) => [input.type, input.name, input.value])).toEqual([
      ['hidden', 'access_token', 'secret-token'],
      ['hidden', 'next', '/redteam/rolodex/'],
    ]);
    expect(form.submit).toHaveBeenCalledOnce();
    expect(form.remove).toHaveBeenCalledOnce();
  });

  it('戻り先がなければ next を送らない', () => {
    const { doc, body } = fakeDocument();
    submitHubLogin(doc, '/redteam/accounts/hub-login/', 'secret-token');
    expect(body.children[0].children.map((input: any) => input.name)).toEqual(['access_token']);
  });
});
