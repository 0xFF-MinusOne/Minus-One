import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { signOutCurrent, useAuth } from '../auth/AuthProvider';
import { Button, ErrorNote, Field, Loading } from '../components/ui';
import { safeRedirect } from '../lib/redirect';
import { supabase } from '../lib/supabase';

interface Enrollment {
  factorId: string;
  qrCode: string;
  secret: string;
}

/** 途中でやめた登録が残っていると新しく登録できないので、未確認の分を消してから始める。 */
async function startEnrollment(): Promise<Enrollment> {
  const factors = await supabase.auth.mfa.listFactors();
  if (factors.error) throw factors.error;
  for (const factor of factors.data.all) {
    if (factor.status === 'unverified') {
      const removed = await supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (removed.error) throw removed.error;
    }
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: 'Pentest Dashboard',
    issuer: 'Pentest Dashboard',
  });
  if (error) throw error;
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

async function findVerifiedFactor(): Promise<string> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  const factor = data.totp[0];
  if (!factor) throw new Error('factor not found');
  return factor.id;
}

export function MfaPage() {
  const { session, loading, mfa, recheckMfa } = useAuth();
  const location = useLocation();
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // StrictMode の二重実行で登録を 2 回始めないようにする。
  const enrollStarted = useRef(false);

  useEffect(() => {
    if (mfa !== 'enroll' || enrollStarted.current) return;
    enrollStarted.current = true;
    startEnrollment()
      .then(setEnrollment)
      .catch(() => setSetupError('登録を始められませんでした。再読み込みしてもう一度お試しください。'));
  }, [mfa]);

  if (loading) return <Loading />;
  if (!session) return <Navigate to="/login" replace />;
  if (mfa === 'ready') {
    return <Navigate to={safeRedirect((location.state as { from?: unknown } | null)?.from)} replace />;
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const factorId = enrollment?.factorId ?? (await findVerifiedFactor());
      const result = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
      if (result.error) {
        setError('コードが正しくありません。認証アプリの最新のコードを入力してください。');
        setCode('');
      }
    } catch {
      setError('確認できませんでした。時間をおいてもう一度お試しください。');
    } finally {
      setBusy(false);
    }
  };

  const enrolling = mfa === 'enroll';

  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-4 py-10">
      <div className="w-full max-w-sm rounded-xl border border-line bg-white p-7 shadow-card">
        <h1 className="text-xl font-bold">{enrolling ? '2 段階認証を登録' : '2 段階認証'}</h1>
        {mfa === 'error' ? (
          <div className="mt-4 space-y-3">
            <ErrorNote>2 段階認証の状態を確認できませんでした。</ErrorNote>
            <Button onClick={recheckMfa}>もう一度確認</Button>
          </div>
        ) : (
          <>
            <p className="mt-1 text-sm text-ink-soft">
              {enrolling
                ? '認証アプリで QR コードを読み取り、表示された 6 桁のコードを入力してください。登録が終わるまで、ほかの画面には進めません。'
                : '認証アプリに表示された 6 桁のコードを入力してください。'}
            </p>
            {setupError ? (
              <div className="mt-4">
                <ErrorNote>{setupError}</ErrorNote>
              </div>
            ) : null}
            {enrolling && !enrollment && !setupError ? <Loading /> : null}
            {enrollment ? (
              <div className="mt-4 text-center">
                <img
                  src={enrollment.qrCode}
                  alt="2 段階認証の登録用 QR コード"
                  width={200}
                  height={200}
                  className="mx-auto h-[200px] w-[200px]"
                />
                <p className="mt-3 text-xs text-ink-muted">読み取れない場合は、次の文字列を入力してください。</p>
                <code className="mt-1 block select-all break-all font-mono text-xs">{enrollment.secret}</code>
              </div>
            ) : null}
            {!enrolling || enrollment ? (
              <form onSubmit={(event) => void submit(event)} className="mt-5 space-y-4">
                <Field label="確認コード">
                  <input
                    className="field-control text-center font-mono tracking-[0.3em]"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    autoFocus
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                  />
                </Field>
                {error ? <ErrorNote>{error}</ErrorNote> : null}
                <Button type="submit" variant="primary" className="w-full" loading={busy} disabled={code.length !== 6}>
                  確認
                </Button>
              </form>
            ) : null}
          </>
        )}
        <button
          type="button"
          onClick={() => void signOutCurrent()}
          className="mt-4 w-full text-center text-sm text-ink-soft hover:underline"
        >
          ログアウト
        </button>
        <p className="mt-3 text-center text-xs text-ink-muted">
          認証アプリを使えなくなった場合は、管理者にリセットを依頼してください。
        </p>
      </div>
    </main>
  );
}
