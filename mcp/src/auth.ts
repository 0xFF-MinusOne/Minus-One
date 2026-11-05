import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { BotCredentials } from '../../scripts/mcp-shared.mjs';
import { generateTotp } from '../../scripts/totp.mjs';
import type { Database } from '../../src/lib/database.types';
import type { McpConfig } from './config';

export type DbClient = SupabaseClient<Database>;

/** 外へ出してよい認証の失敗。元のエラーやトークンは持たない。 */
export class BotAuthError extends Error {
  constructor() {
    super('ボットとしてログインできませんでした。ボットの状態を管理者に確認してください。');
  }
}

export function jwtAal(token: string): string | null {
  try {
    const payload = token.split('.')[1] ?? '';
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { aal?: unknown };
    return typeof parsed.aal === 'string' ? parsed.aal : null;
  } catch {
    return null;
  }
}

/** Auth が混雑で 5xx を返したときだけ、やり直す。 */
async function withRetry<T extends { error: { status?: number } | null }>(run: () => Promise<T>): Promise<T> {
  let result = await run();
  for (let attempt = 0; attempt < 3 && result.error && (result.error.status ?? 500) >= 500; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    result = await run();
  }
  return result;
}

/** 通常のユーザーとしてログインし、TOTP を通して aal2 を保つ。 */
export class BotSession {
  readonly client: DbClient;
  private inFlight: Promise<void> | null = null;

  constructor(
    config: Pick<McpConfig, 'url' | 'publicKey'>,
    private readonly credentials: BotCredentials,
    client?: DbClient,
  ) {
    this.client =
      client ??
      createClient<Database>(config.url, config.publicKey, {
        auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false },
      });
  }

  /** 使う前に毎回呼ぶ。期限切れは getSession が更新し、aal2 でなければログインし直す。 */
  ensureAal2(): Promise<void> {
    this.inFlight ??= this.check().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async check(): Promise<void> {
    const { data, error } = await this.client.auth.getSession();
    if (!error && data.session && jwtAal(data.session.access_token) === 'aal2') return;
    await this.login();
  }

  private async login(): Promise<void> {
    const { email, password, totpSecret } = this.credentials;
    const signIn = await withRetry(() => this.client.auth.signInWithPassword({ email, password }));
    if (signIn.error) throw new BotAuthError();
    const factors = await withRetry(() => this.client.auth.mfa.listFactors());
    const factor = factors.data?.totp[0];
    if (factors.error || !factor) throw new BotAuthError();
    const verified = await withRetry(() =>
      this.client.auth.mfa.challengeAndVerify({ factorId: factor.id, code: generateTotp(totpSecret) }),
    );
    if (verified.error) throw new BotAuthError();
    const { data } = await this.client.auth.getSession();
    if (!data.session || jwtAal(data.session.access_token) !== 'aal2') throw new BotAuthError();
  }

  async close(): Promise<void> {
    await this.client.auth.stopAutoRefresh();
  }
}
