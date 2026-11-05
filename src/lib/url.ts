/** http / https の URL だけを正規化して返す。それ以外（javascript: など）は null。 */
export function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  // URL パーサーは「https://\\evil」や「https:///evil」のような形も受け入れるので、先に形を確かめる。
  if (!/^https?:\/\/[^\s\\/]/i.test(trimmed)) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname) return null;
    return url.href;
  } catch {
    return null;
  }
}
