// 統合テスト専用の入口。キーチェーンの代わりに環境変数からログイン情報を読む。
// mcp/src/main.ts には含まれず、mcp/dist/server.mjs にも入らない。ローカルにだけ接続できる。
import { readConfig } from '../../mcp/src/config';
import { runServer } from '../../mcp/src/server';

const config = readConfig(process.env);
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(config.url)) {
  console.error('テスト用の入口はローカルにだけ接続できます。');
  process.exit(1);
}
const { PENTEST_MCP_TEST_EMAIL: email, PENTEST_MCP_TEST_PASSWORD: password, PENTEST_MCP_TEST_TOTP: totpSecret } = process.env;
if (!email || !password || !totpSecret) {
  console.error('テスト用のログイン情報がありません。');
  process.exit(1);
}
await runServer(config, { email, password, totpSecret });
