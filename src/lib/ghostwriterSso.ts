/** Hub のセッションで Ghostwriter にログインする処理。トークンは URL にもログにも出さない。 */

/** 残りがこの秒数より短いアクセストークンは、送る前に更新する。 */
const REFRESH_MARGIN_SECONDS = 120;

interface SessionLike {
  access_token: string;
  expires_at?: number;
}
interface AuthResult {
  data: { session: SessionLike | null };
  error: unknown;
}
export interface SessionSource {
  getSession(): Promise<AuthResult>;
  refreshSession(): Promise<AuthResult>;
}

/** 接続先（/redteam/ や https の URL）から、ログイン用の送信先を組み立てる。 */
export function ghostwriterHubLoginEndpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/accounts/hub-login/`;
}

/** ログイン後の戻り先。パスだけを渡す。最終的な検証は Ghostwriter 側でも行う。 */
export function safeGhostwriterNext(value: string | null): string | undefined {
  return value && /^\/(?![/\\])/.test(value) ? value : undefined;
}

/** 期限が近ければ更新してから、アクセストークンを返す。 */
export async function freshAccessToken(auth: SessionSource, now: number = Date.now()): Promise<string> {
  const current = await auth.getSession();
  if (current.error || !current.data.session) throw new Error('セッションを確認できませんでした。');
  const { access_token: token, expires_at: expiresAt } = current.data.session;
  if (expiresAt !== undefined && expiresAt - now / 1000 > REFRESH_MARGIN_SECONDS) return token;

  const refreshed = await auth.refreshSession();
  if (refreshed.error || !refreshed.data.session) throw new Error('セッションを更新できませんでした。');
  return refreshed.data.session.access_token;
}

/**
 * トップレベルのフォーム POST で Ghostwriter へ送る。
 *
 * 公開時の Hub は Referrer-Policy: no-referrer なので、そのままだとブラウザは Origin: null を送り、
 * Ghostwriter の Origin の検査で拒否される。この画面だけ strict-origin に変えて、Origin を送らせる。
 * Referer にも送られるのはオリジンだけなので、パスやクエリは漏れない。
 */
export function submitHubLogin(doc: Document, endpoint: string, accessToken: string, next?: string): void {
  const referrer = doc.createElement('meta');
  referrer.name = 'referrer';
  referrer.content = 'strict-origin';
  doc.head.append(referrer);

  const form = doc.createElement('form');
  form.method = 'post';
  form.action = endpoint;
  form.hidden = true;
  const fields: Record<string, string> = { access_token: accessToken, ...(next ? { next } : {}) };
  for (const [name, value] of Object.entries(fields)) {
    const input = doc.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.append(input);
  }
  doc.body.append(form);
  form.submit();
  // 送信内容は submit() の時点で確定する。トークンを画面に残さない。
  form.remove();
}
