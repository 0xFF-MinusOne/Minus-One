import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useMembership } from '../api/queries';
import { Button, ErrorNote } from '../components/ui';
import { errorMessage } from '../lib/errors';
import { isIdleExpired, lastActivity, markActivity, noteIdleLogout } from '../lib/idle';
import { supabase } from '../lib/supabase';
import { ForcedPasswordChange } from '../pages/ChangePasswordPage';

/** enroll: 未登録、verify: コード入力待ち、ready: aal2、error: 判定できず先へ進めない。 */
export type MfaStatus = 'unknown' | 'enroll' | 'verify' | 'ready' | 'error';

interface AuthState {
  session: Session | null;
  loading: boolean;
  mfa: MfaStatus;
  recheckMfa: () => void;
}

const AuthContext = createContext<AuthState>({ session: null, loading: true, mfa: 'unknown', recheckMfa: () => undefined });

/**
 * この端末のセッションを終える（ほかの端末は切らない）。
 * 通信できないと Supabase はセッションを消さないので、その場合は保存分を直接消して画面を読み直す。
 */
export async function signOutCurrent(): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (!error) return;
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith('sb-') && key.endsWith('-auth-token')) window.localStorage.removeItem(key);
    }
  } finally {
    window.location.assign('/login');
  }
}

async function detectMfaStatus(): Promise<MfaStatus> {
  const level = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (level.error) throw level.error;
  if (level.data.currentLevel === 'aal2') return 'ready';
  const factors = await supabase.auth.mfa.listFactors();
  if (factors.error) throw factors.error;
  return factors.data.totp.length > 0 ? 'verify' : 'enroll';
}

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'scroll'] as const;
const IDLE_CHECK_MS = 15_000;
const ACTIVITY_WRITE_MS = 5_000;

/** ログイン中に 30 分操作がなければログアウトする。タブをまたいで操作時刻を共有する。 */
function useIdleLogout(active: boolean) {
  useEffect(() => {
    if (!active) return;
    let lastWrite = 0;
    const onActivity = () => {
      const now = Date.now();
      if (now - lastWrite > ACTIVITY_WRITE_MS) {
        lastWrite = now;
        markActivity(now);
      }
    };
    const check = () => {
      const last = lastActivity();
      if (last === null) {
        markActivity();
      } else if (isIdleExpired(last, Date.now())) {
        noteIdleLogout();
        void signOutCurrent();
      }
    };
    // 閉じていたブラウザを開き直した場合も、ここで判定する。
    check();
    const timer = window.setInterval(check, IDLE_CHECK_MS);
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, onActivity, { passive: true, capture: true });
    document.addEventListener('visibilitychange', check);
    return () => {
      window.clearInterval(timer);
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, onActivity, { capture: true });
      document.removeEventListener('visibilitychange', check);
    };
  }, [active]);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [mfa, setMfa] = useState<MfaStatus>('unknown');
  const [recheck, setRecheck] = useState(0);
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    // ユーザーが変わったら、前のユーザーのデータを画面に残さない。
    const apply = (next: Session | null) => {
      const userId = next?.user.id ?? null;
      if (userId !== userIdRef.current) {
        userIdRef.current = userId;
        client.clear();
        setMfa('unknown');
      }
      setSession(next);
      setSessionLoaded(true);
    };

    supabase.auth
      .getSession()
      .then(({ data }) => apply(data.session))
      .catch(() => apply(null));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => apply(next));
    return () => data.subscription.unsubscribe();
  }, [client]);

  // onAuthStateChange の中で supabase を呼ぶと止まることがあるので、state の変化を受けて判定する。
  const accessToken = session?.access_token ?? null;
  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    detectMfaStatus()
      .then((status) => {
        if (!cancelled) setMfa(status);
      })
      .catch(() => {
        if (!cancelled) setMfa('error');
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, recheck]);

  useIdleLogout(Boolean(session));

  const recheckMfa = useCallback(() => setRecheck((value) => value + 1), []);
  const loading = !sessionLoaded || (Boolean(session) && mfa === 'unknown');

  return (
    <AuthContext.Provider value={{ session, loading, mfa: session ? mfa : 'unknown', recheckMfa }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

export function useUserEmail(): string {
  return useAuth().session?.user.email ?? '';
}

function FullPageMessage({ children }: { children: ReactNode }) {
  return <div className="grid min-h-screen place-items-center px-4 text-sm text-ink-muted">{children}</div>;
}

/** ログインと 2 段階認証が終わるまで、ほかの画面に入れない。 */
export function RequireAuth() {
  const { session, loading, mfa } = useAuth();
  const location = useLocation();
  const from = location.pathname + location.search;
  if (loading) return <FullPageMessage>読み込み中…</FullPageMessage>;
  if (!session) return <Navigate to="/login" replace state={{ from }} />;
  if (mfa !== 'ready') return <Navigate to="/mfa" replace state={{ from }} />;
  return <Outlet />;
}

export function RequireMember() {
  const membership = useMembership();
  if (membership.isPending) return <FullPageMessage>読み込み中…</FullPageMessage>;
  if (membership.error || !membership.data) {
    return (
      <FullPageMessage>
        <div className="max-w-sm space-y-4 text-center">
          <ErrorNote>
            {membership.error
              ? errorMessage(membership.error)
              : 'このアカウントにはアクセス権がありません。管理者に確認してください。'}
          </ErrorNote>
          <Button onClick={() => void signOutCurrent()}>ログアウト</Button>
        </div>
      </FullPageMessage>
    );
  }
  // 印は本人が書き換えられない members にある。ここで止めるので、どのパスでも先に進めない。
  if (membership.data.must_change_password) return <ForcedPasswordChange />;
  return <Outlet />;
}
