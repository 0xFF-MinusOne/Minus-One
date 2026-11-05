interface ImportMetaEnv {
  /** Ghostwriter の公開 URL。未設定または不正なら入口は「準備中」になる。ビルド時に埋め込まれる。 */
  readonly VITE_GHOSTWRITER_URL?: string;
  /** 'true' のとき、入口を /open/redteam に向けて Hub のログインで Ghostwriter を開く。 */
  readonly VITE_GHOSTWRITER_SSO?: string;
}
