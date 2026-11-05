import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, ErrorNote } from '../components/ui';
import { freshAccessToken, safeGhostwriterNext, submitHubLogin } from '../lib/ghostwriterSso';
import { supabase } from '../lib/supabase';
import { ghostwriterHubLoginEndpoint } from '../products';

type Status = 'opening' | 'paused' | 'error';

/** 戻るボタンで来たときに自動で送ると、Ghostwriter へ押し戻されて戻れなくなる。 */
function arrivedByBackOrForward(): boolean {
  const [entry] = window.performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
  return entry?.type === 'back_forward';
}

/** ログインと MFA とメンバー確認を済ませた人を、Ghostwriter へ送る。 */
export function OpenGhostwriterPage() {
  const [params] = useSearchParams();
  const next = safeGhostwriterNext(params.get('next'));
  const [status, setStatus] = useState<Status>('opening');
  const started = useRef(false);

  const open = useCallback(async () => {
    if (!ghostwriterHubLoginEndpoint) return;
    setStatus('opening');
    try {
      const token = await freshAccessToken(supabase.auth);
      submitHubLogin(document, ghostwriterHubLoginEndpoint, token, next);
    } catch {
      setStatus('error');
    }
  }, [next]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (arrivedByBackOrForward()) setStatus('paused');
    else void open();
  }, [open]);

  return (
    <div className="grid min-h-screen place-items-center px-4 text-sm text-ink-muted">
      <div className="max-w-sm space-y-4 text-center">
        {!ghostwriterHubLoginEndpoint ? (
          <p>Ghostwriter へのログイン連携は有効になっていません。</p>
        ) : status === 'error' ? (
          <ErrorNote>Ghostwriter を開けませんでした。もう一度お試しください。</ErrorNote>
        ) : status === 'opening' ? (
          <p>Ghostwriter を開いています…</p>
        ) : null}
        {ghostwriterHubLoginEndpoint && (
          <Button onClick={() => void open()}>Ghostwriter を開く</Button>
        )}
        <p>
          <a href="/" className="font-semibold text-brand-700 hover:underline">
            ホームへ戻る
          </a>
        </p>
      </div>
    </div>
  );
}
