import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../../', import.meta.url));
const buildDir = `${root}tests/integration/.build`;

/** 本番の入口とテスト用の入口を、それぞれ実際に実行できる形にする。 */
export default async function setup(): Promise<() => void> {
  const common = { bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'warning' } as const;
  await build({ ...common, entryPoints: [`${root}mcp/src/main.ts`], outfile: `${root}mcp/dist/server.mjs` });
  await build({ ...common, entryPoints: [`${root}tests/integration/mcp-test-entry.ts`], outfile: `${buildDir}/mcp-test-server.mjs` });
  return () => rmSync(buildDir, { recursive: true, force: true });
}
