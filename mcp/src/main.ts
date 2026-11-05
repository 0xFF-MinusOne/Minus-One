// 本番の入口。ログイン情報は macOS のキーチェーンからだけ読む。
// テスト用の差し替えは tests/ の別の入口にあり、この経路には含まれない。
import { keychainServiceFor, readBotCredentials } from '../../scripts/mcp-shared.mjs';
import { readConfig } from './config';
import { runServer } from './server';

async function main(): Promise<void> {
  if (process.platform !== 'darwin') throw new Error('この MCP サーバーは macOS でだけ動きます。');
  const config = readConfig(process.env);
  const credentials = await readBotCredentials(keychainServiceFor(config.url));
  if (!credentials) {
    throw new Error('キーチェーンからボットのログイン情報を読めませんでした。scripts/setup-mcp-bot.mjs で作成してください。');
  }
  await runServer(config, credentials);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : '起動できませんでした。');
  process.exit(1);
});
