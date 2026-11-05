export const IDLE_LIMIT_MS = 30 * 60 * 1000;

const ACTIVITY_KEY = 'pentest:last-activity';
const NOTICE_KEY = 'pentest:idle-logout';

/** storage が使えない環境でも落ちないように、読み書きはすべて保護する。 */
function read(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}

function write(storage: () => Storage, key: string, value: string): void {
  try {
    storage().setItem(key, value);
  } catch {
    // 保存できなくても、開いているタブの中の判定は続けられる。
  }
}

const local = () => window.localStorage;
const session = () => window.sessionStorage;

let memoryLastActivity = 0;

export function isIdleExpired(lastActivity: number, now: number, limit = IDLE_LIMIT_MS): boolean {
  return now - lastActivity >= limit;
}

export function markActivity(now = Date.now()): void {
  memoryLastActivity = now;
  write(local, ACTIVITY_KEY, String(now));
}

/** ほかのタブの操作も含めた、最後の操作時刻。記録が無ければ null。 */
export function lastActivity(): number | null {
  const stored = Number(read(local, ACTIVITY_KEY));
  const latest = Math.max(Number.isFinite(stored) ? stored : 0, memoryLastActivity);
  return latest > 0 ? latest : null;
}

export function noteIdleLogout(): void {
  write(session, NOTICE_KEY, '1');
}

export function consumeIdleLogoutNotice(): boolean {
  const present = read(session, NOTICE_KEY) === '1';
  if (present) {
    try {
      session().removeItem(NOTICE_KEY);
    } catch {
      // 消せなくても表示が 1 回多くなるだけ。
    }
  }
  return present;
}
