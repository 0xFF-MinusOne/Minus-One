/** ログイン後の戻り先。サイト内のパスだけを許可する。 */
export function safeRedirect(value: unknown): string {
  return typeof value === 'string' && /^\/(?![/\\])/.test(value) ? value : '/pentest';
}
