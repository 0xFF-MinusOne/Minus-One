import { useState, type FormEvent } from 'react';
import { useRefreshData } from '../api/queries';
import { signOutCurrent } from '../auth/AuthProvider';
import { Button, Card, ErrorNote, Field, PageHeader } from '../components/ui';
import { MIN_PASSWORD_LENGTH, passwordErrorMessage, validateNewPassword } from '../lib/password';
import { supabase } from '../lib/supabase';

function ChangePasswordForm({ onChanged }: { onChanged: () => void }) {
  const refresh = useRefreshData();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const invalid = validateNewPassword(password, confirmation);
    if (invalid) return setError(invalid);
    setBusy(true);
    setError(null);
    try {
      const result = await supabase.auth.updateUser({ password });
      if (result.error) {
        setError(passwordErrorMessage(result.error.code));
        return;
      }
      setPassword('');
      setConfirmation('');
      // 変更必須の印は DB のトリガーが解除している。読み直して画面に反映する。
      await refresh();
      onChanged();
    } catch {
      setError(passwordErrorMessage(undefined));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-4" noValidate>
      <Field label="新しいパスワード" hint={`${MIN_PASSWORD_LENGTH} 文字以上`}>
        <input
          type="password"
          autoComplete="new-password"
          className="field-control"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </Field>
      <Field label="新しいパスワード（確認）">
        <input
          type="password"
          autoComplete="new-password"
          className="field-control"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
        />
      </Field>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <Button type="submit" variant="primary" className="w-full" loading={busy}>
        変更する
      </Button>
    </form>
  );
}

/** ユーザーメニューから開く画面。ここに来る時点で aal2 とメンバー確認は済んでいる。 */
export function ChangePasswordPage() {
  const [done, setDone] = useState(false);
  return (
    <>
      <PageHeader title="パスワードの変更" />
      <Card className="max-w-md">
        {done ? (
          <p role="status" className="mb-4 rounded-lg bg-[#E8F7EE] px-3 py-2 text-sm text-[#17663B]">
            パスワードを変更しました。
          </p>
        ) : null}
        <ChangePasswordForm onChanged={() => setDone(true)} />
      </Card>
    </>
  );
}

/** 招待された人の初回の変更。終わるまでほかの画面には進めない。 */
export function ForcedPasswordChange() {
  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-4 py-10">
      <div className="w-full max-w-sm rounded-xl border border-line bg-white p-7 shadow-card">
        <h1 className="text-xl font-bold">パスワードの変更</h1>
        <p className="mb-5 mt-1 text-sm text-ink-soft">
          初期パスワードを、自分だけが知っているものに変更してください。変更が終わるまで、ほかの画面には進めません。
        </p>
        <ChangePasswordForm onChanged={() => undefined} />
        <button
          type="button"
          onClick={() => void signOutCurrent()}
          className="mt-4 w-full text-center text-sm text-ink-soft hover:underline"
        >
          ログアウト
        </button>
      </div>
    </main>
  );
}
