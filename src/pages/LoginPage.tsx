import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { consumeIdleLogoutNotice, markActivity } from '../lib/idle';
import { useAuth } from '../auth/AuthProvider';
import { Button, ErrorNote, Field } from '../components/ui';
import { safeRedirect } from '../lib/redirect';
import { supabase, supabaseConfigured } from '../lib/supabase';

export function LoginPage() {
  const { session, loading } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idleNotice] = useState(consumeIdleLogoutNotice);

  if (!loading && session) {
    const from = (location.state as { from?: unknown } | null)?.from;
    return <Navigate to={safeRedirect(from)} replace />;
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    // 前回の無操作時間で、ログイン直後に切れないようにする。
    markActivity();
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (signInError) {
        setError(
          signInError.status === 400
            ? 'メールアドレスまたはパスワードが違います。'
            : 'ログインできませんでした。時間をおいてもう一度お試しください。',
        );
      }
    } catch {
      setError('サーバーに接続できませんでした。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-4 py-10">
      <div className="w-full max-w-sm rounded-xl border border-line bg-white p-7 shadow-card">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src="/brand/pentest-dashboard-icon.png" alt="" width={45} height={60} className="mb-3 h-[60px] w-auto" />
          <h1 className="text-xl font-bold">Pentest Dashboard</h1>
          <p className="mt-1 text-sm text-ink-soft">脆弱性の管理ツールにログインします。</p>
        </div>
        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          <Field label="メールアドレス">
            <input
              type="email"
              autoComplete="username"
              required
              className="field-control"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <Field label="パスワード">
            <input
              type="password"
              autoComplete="current-password"
              required
              className="field-control"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
          {idleNotice ? (
            <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">
              30 分間操作がなかったため、ログアウトしました。
            </p>
          ) : null}
          {error ? <ErrorNote>{error}</ErrorNote> : null}
          {supabaseConfigured ? null : (
            <ErrorNote>接続設定がありません。README の手順で .env.local を作成してください。</ErrorNote>
          )}
          <Button type="submit" variant="primary" className="w-full" loading={busy} disabled={!supabaseConfigured}>
            ログイン
          </Button>
        </form>
        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-ink-muted">
          <img src="/brand/0xff-mark.png" alt="0xFF" width={20} height={20} className="logo-on-white h-5 w-5" />
          MINUS ONE
        </div>
      </div>
    </main>
  );
}
