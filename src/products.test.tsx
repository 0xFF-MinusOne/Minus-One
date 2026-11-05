import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { publicAppUrl } from './products';

vi.mock('./lib/supabase', () => ({ supabase: {}, supabaseConfigured: true }));

describe('publicAppUrl', () => {
  it.each([undefined, '', '   '])('未設定は拒否する: %j', (value) => {
    expect(publicAppUrl(value, false)).toBeUndefined();
  });

  it('https は開発・本番とも許可し、前後の空白を取り除く', () => {
    expect(publicAppUrl(' https://ghostwriter.example.com ', false)).toBe('https://ghostwriter.example.com/');
    expect(publicAppUrl('https://ghostwriter.example.com/app', true)).toBe('https://ghostwriter.example.com/app');
  });

  it.each([
    'https://user:secret@ghostwriter.example.com',
    'https://user@ghostwriter.example.com',
    'https://:secret@ghostwriter.example.com',
    'http://user:secret@127.0.0.1:8093',
  ])('認証情報入りの URL は拒否する: %s', (value) => {
    expect(publicAppUrl(value, true)).toBeUndefined();
  });

  it.each(['https://ghostwriter.example.com/?token=secret', 'https://ghostwriter.example.com/#token=secret'])(
    'クエリと # 以降がある URL は拒否する: %s',
    (value) => {
      expect(publicAppUrl(value, true)).toBeUndefined();
    },
  );

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    ' javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:alert(1)',
    'file:///etc/passwd',
    'ftp://ghostwriter.example.com',
    'ghostwriter.example.com',
    '//ghostwriter.example.com',
    '/pentest',
    '/redteam/',
    '/redteam/admin',
    '/redteam/../evil',
    '/redteamx',
    '/REDTEAM',
    '//evil.example',
    '//evil.example/redteam',
    'redteam',
    './redteam',
    'not a url',
  ])('不正なプロトコル・形式は拒否する: %s', (value) => {
    expect(publicAppUrl(value, true)).toBeUndefined();
    expect(publicAppUrl(value, false)).toBeUndefined();
  });

  it('同じオリジンの /redteam は開発・本番とも許可する', () => {
    expect(publicAppUrl('/redteam', true)).toBe('/redteam/');
    expect(publicAppUrl(' /redteam ', false)).toBe('/redteam/');
  });

  it.each(['http://127.0.0.1:8093', 'http://localhost:8093', 'http://ghostwriter.example.com'])(
    '本番ビルドでは http を拒否する: %s',
    (value) => {
      expect(publicAppUrl(value, false)).toBeUndefined();
    },
  );

  it('開発時の http はローカルの接続先だけ許可する', () => {
    expect(publicAppUrl('http://127.0.0.1:8093', true)).toBe('http://127.0.0.1:8093/');
    expect(publicAppUrl('http://localhost:8093', true)).toBe('http://localhost:8093/');
    expect(publicAppUrl('http://ghostwriter.example.com', true)).toBeUndefined();
    expect(publicAppUrl('http://localhost.example.com', true)).toBeUndefined();
  });
});

describe('Ghostwriter の入口', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  /** products.ts は読み込み時に環境変数を読むので、設定ごとに読み込み直す。 */
  async function renderEntrances(env: { url: string; dev?: boolean; sso?: string }) {
    vi.resetModules();
    vi.stubEnv('VITE_GHOSTWRITER_URL', env.url);
    vi.stubEnv('VITE_GHOSTWRITER_SSO', env.sso ?? '');
    vi.stubEnv('DEV', env.dev ?? true);
    vi.stubEnv('PROD', !(env.dev ?? true));
    const [{ default: HomePage }, { Sidebar }] = await Promise.all([
      import('./hub/HomePage'),
      import('./components/Layout'),
    ]);
    return {
      home: renderToString(<HomePage />),
      sidebar: renderToString(
        <MemoryRouter>
          <Sidebar />
        </MemoryRouter>,
      ),
    };
  }

  /** ホームのカードから Ghostwriter の部分を取り出す。 */
  function ghostwriterCard(home: string): string {
    const name = home.indexOf('案件・報告書');
    const start = Math.max(home.lastIndexOf('<a ', name), home.lastIndexOf('<article', name));
    const closings = ['</a>', '</article>'].map((tag) => home.indexOf(tag, name)).filter((index) => index >= 0);
    return home.slice(start, Math.min(...closings));
  }

  it('未設定なら準備中で、カードもナビもリンクにしない', async () => {
    const { home, sidebar } = await renderEntrances({ url: '' });
    const card = ghostwriterCard(home);
    expect(card.startsWith('<article')).toBe(true);
    expect(card).toContain('準備中');
    expect(card).not.toContain('href=');
    expect(sidebar).toContain('Ghostwriter');
    expect(sidebar).toContain('準備中');
    expect(sidebar).not.toContain('target="_blank"');
  });

  it('https を設定すると新しいタブで開くリンクになる', async () => {
    const { home, sidebar } = await renderEntrances({ url: 'https://ghostwriter.example.com', dev: false });
    const card = ghostwriterCard(home);
    expect(card.startsWith('<a ')).toBe(true);
    expect(card).toContain('href="https://ghostwriter.example.com/"');
    expect(card).toContain('target="_blank"');
    expect(card).toContain('rel="noopener noreferrer"');
    expect(card).not.toContain('準備中');
    expect(sidebar).toContain('href="https://ghostwriter.example.com/"');
    expect(sidebar).toContain('rel="noopener noreferrer"');
    expect(sidebar).not.toContain('準備中');
  });

  it.each([
    ['ローカルの http', 'http://127.0.0.1:8093'],
    ['認証情報入り', 'https://user:secret@ghostwriter.example.com'],
    ['不正なプロトコル', 'javascript:alert(1)'],
  ])('本番ビルドでは%sの接続先を準備中にする', async (_label, url) => {
    const { home, sidebar } = await renderEntrances({ url, dev: false });
    expect(ghostwriterCard(home)).toContain('準備中');
    expect(`${home}${sidebar}`).not.toContain(url);
    expect(`${home}${sidebar}`).not.toContain('secret');
  });

  it('/redteam を設定すると同じタブで開く通常のリンクになる', async () => {
    const { home, sidebar } = await renderEntrances({ url: '/redteam' });
    const card = ghostwriterCard(home);
    expect(card.startsWith('<a ')).toBe(true);
    expect(card).toContain('href="/redteam/"');
    expect(card).not.toContain('target=');
    expect(card).not.toContain('新しいタブ');
    expect(card).not.toContain('準備中');
    expect(sidebar).toContain('href="/redteam/"');
    expect(sidebar).not.toContain('target="_blank"');
    expect(sidebar).not.toContain('新しいタブ');
  });

  it('開発時はローカルの Ghostwriter へリンクする', async () => {
    const { home } = await renderEntrances({ url: 'http://127.0.0.1:8093', dev: true });
    expect(ghostwriterCard(home)).toContain('href="http://127.0.0.1:8093/"');
  });

  it('ログイン連携が有効で同じオリジンなら、同じタブで /open/redteam を開く', async () => {
    const { home, sidebar } = await renderEntrances({ url: '/redteam', sso: 'true' });
    const card = ghostwriterCard(home);
    expect(card).toContain('href="/open/redteam"');
    expect(card).not.toContain('target=');
    expect(sidebar).toContain('href="/open/redteam"');
    expect(sidebar).not.toContain('href="/redteam/"');
  });

  it('ログイン連携が有効で別ドメインなら、新しいタブで /open/redteam を開く', async () => {
    const { home, sidebar } = await renderEntrances({ url: 'https://ghostwriter.example.com', dev: false, sso: 'true' });
    const card = ghostwriterCard(home);
    expect(card).toContain('href="/open/redteam"');
    expect(card).toContain('target="_blank"');
    expect(`${home}${sidebar}`).not.toContain('ghostwriter.example.com');
  });

  it.each(['', 'false', '1', 'TRUE'])('VITE_GHOSTWRITER_SSO=%j では今の入口のまま', async (sso) => {
    const { home } = await renderEntrances({ url: '/redteam', sso });
    expect(ghostwriterCard(home)).toContain('href="/redteam/"');
    expect(home).not.toContain('/open/redteam');
  });

  it('接続先が未設定なら、ログイン連携が有効でも準備中のまま', async () => {
    const { home, sidebar } = await renderEntrances({ url: '', sso: 'true' });
    expect(ghostwriterCard(home)).toContain('準備中');
    expect(`${home}${sidebar}`).not.toContain('/open/redteam');
  });

  it('送信先を接続先から組み立てる', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_GHOSTWRITER_URL', 'https://ghostwriter.example.com/app');
    vi.stubEnv('VITE_GHOSTWRITER_SSO', 'true');
    vi.stubEnv('DEV', false);
    const { ghostwriterHubLoginEndpoint } = await import('./products');
    expect(ghostwriterHubLoginEndpoint).toBe('https://ghostwriter.example.com/app/accounts/hub-login/');
  });

  it('ホームとナビに Recon の入口を残さず、既存実績は同じタブの /pentest のまま', async () => {
    const { home, sidebar } = await renderEntrances({ url: 'https://ghostwriter.example.com', dev: false });
    expect(home).not.toContain('href="/recon');
    expect(sidebar).not.toContain('/recon');
    expect(sidebar).not.toContain('Recon');
    expect(home).toMatch(/<a [^>]*href="\/pentest"/);
    expect(home).not.toMatch(/<a [^>]*href="\/pentest"[^>]*target=/);
    expect(sidebar).toContain('href="/pentest"');
  });
});
