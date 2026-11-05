import { defineConfig } from 'vitest/config';

// ローカルの Supabase が起動している必要がある統合確認。`npm run test:integration` で実行する。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    globalSetup: ['tests/integration/mcp-global-setup.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
