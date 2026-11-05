import { ghostwriterHubLoginEndpoint as buildHubLoginEndpoint } from './lib/ghostwriterSso';

/** アプリ一覧。アプリを増やすときはここに追加する。url がなければ「準備中」と表示する。 */
export interface Product {
  id: string;
  name: string;
  category: string;
  description: string;
  url?: string;
  /** 別のアプリとして新しいタブで開く。 */
  external?: boolean;
}

/** Hub と同じオリジンのプロキシ経由で動く Ghostwriter の入口。 */
const GHOSTWRITER_SAME_ORIGIN_PATH = '/redteam';

/**
 * ビルド結果に埋め込んでよい接続先だけを返す。それ以外は undefined（画面では準備中）にする。
 * - https のみ許可する。http は開発時のローカル接続先に限る。
 * - ユーザー名・パスワード入りの URL は拒否する。トークンを載せられるクエリと # 以降も拒否する。
 * - 相対パスは同じオリジンの /redteam だけ許可する。
 */
export function publicAppUrl(value: string | undefined, isDev: boolean = import.meta.env.DEV): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (trimmed === GHOSTWRITER_SAME_ORIGIN_PATH) return `${trimmed}/`;
  try {
    const url = new URL(trimmed);
    if (url.username || url.password || url.search || url.hash) return undefined;
    if (url.protocol === 'https:' || (isDev && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) return url.href;
  } catch { /* 無効な接続先は公開しない */ }
  return undefined;
}
export const ghostwriterUrl = publicAppUrl(import.meta.env.VITE_GHOSTWRITER_URL);
/** 同じオリジンで動くときは同じタブで開く。 */
export const ghostwriterOpensInNewTab = !ghostwriterUrl?.startsWith('/');

/** Hub のセッションで Ghostwriter を開く画面。 */
const GHOSTWRITER_SSO_PATH = '/open/redteam';
const ghostwriterSsoEnabled = import.meta.env.VITE_GHOSTWRITER_SSO === 'true';
/** 入口の行き先。ログイン連携が無効なら、Ghostwriter へ直接移動する。 */
export const ghostwriterEntryUrl = ghostwriterUrl && ghostwriterSsoEnabled ? GHOSTWRITER_SSO_PATH : ghostwriterUrl;
/** ログイン連携の送信先。無効なら undefined。 */
export const ghostwriterHubLoginEndpoint =
  ghostwriterUrl && ghostwriterSsoEnabled ? buildHubLoginEndpoint(ghostwriterUrl) : undefined;

export const products: Product[] = [
  {
    id: 'ghostwriter', name: '案件・報告書', category: 'Ghostwriter',
    description: '新しい案件はこちら。証跡・Findings・報告書を管理します。',
    url: ghostwriterEntryUrl, external: ghostwriterOpensInNewTab,
  },
  {
    id: "pentest-dashboard",
    name: "過去の実績",
    category: "Pentest Dashboard",
    description: "これまでの案件・検出事項・実績を確認・管理します。",
    url: "/pentest",
  },
];
