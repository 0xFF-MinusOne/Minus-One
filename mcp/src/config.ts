import { isPublicSupabaseKey, normalizeSupabaseUrl } from '../../scripts/mcp-shared.mjs';

export interface McpConfig {
  url: string;
  publicKey: string;
  /** 未設定なら Trivy の取り込みは無効。 */
  importDir: string | null;
}

/** 環境変数を確かめる。問題があれば理由を投げる。キーの値はメッセージに出さない。 */
export function readConfig(env: NodeJS.ProcessEnv): McpConfig {
  const rawUrl = env.PENTEST_MCP_SUPABASE_URL;
  const key = env.PENTEST_MCP_SUPABASE_KEY;
  if (!rawUrl || !key) {
    throw new Error('環境変数 PENTEST_MCP_SUPABASE_URL と PENTEST_MCP_SUPABASE_KEY を設定してください。');
  }
  if (!isPublicSupabaseKey(key)) {
    throw new Error('PENTEST_MCP_SUPABASE_KEY には公開キーを指定してください。service_role や sb_secret_ のキーでは起動しません。');
  }
  return {
    url: normalizeSupabaseUrl(rawUrl),
    publicKey: key,
    importDir: env.PENTEST_MCP_IMPORT_DIR?.trim() || null,
  };
}
