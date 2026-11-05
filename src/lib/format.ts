/** 日付だけの値（YYYY-MM-DD）や時刻を YYYY/MM/DD で表示する。 */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) return `${dateOnly[1]}/${dateOnly[2]}/${dateOnly[3]}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}/${month}/${day}`;
}

export function formatPeriod(start: string | null, end: string | null): string {
  if (!start && !end) return '—';
  return `${formatDate(start)} 〜 ${formatDate(end)}`;
}

/** 空欄は DB に NULL として保存する。 */
export function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** ダウンロードするファイル名に使えない文字を置き換える。 */
export function safeFileName(value: string): string {
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, '_')
    .replace(/\s+/g, '-')
    .replace(/^[.-]+/, '')
    .slice(0, 80);
  return cleaned || 'project';
}
