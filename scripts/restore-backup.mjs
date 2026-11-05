#!/usr/bin/env node
// scripts/backup.mjs のファイルを、マイグレーション済みでデータが空の DB に復元する。
// 全体を 1 トランザクションで流すので、失敗すれば何も書き込まれない。
//
//   RESTORE_DB_URL      復元先（postgresql://...）
//   BACKUP_PASSPHRASE   暗号化のパスフレーズ
//
//   node scripts/restore-backup.mjs <バックアップファイル>
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { openBackup, verifyBackup } from './backup-crypto.mjs';
import { exitCode, pgEnvFromUrl, requireEnv } from './pg-env.mjs';

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function main() {
  const file = process.argv[2];
  if (!file || !existsSync(file)) fail('使い方: node scripts/restore-backup.mjs <バックアップファイル>');
  const pgEnv = pgEnvFromUrl(requireEnv('RESTORE_DB_URL'), 'RESTORE_DB_URL');
  const passphrase = requireEnv('BACKUP_PASSPHRASE');

  // 壊れたファイルを途中まで流さないよう、先に最後まで復号して確かめる。
  try {
    await verifyBackup(file, passphrase);
  } catch {
    fail('復号できませんでした。パスフレーズかファイルを確認してください。');
  }

  const backup = await openBackup(file, passphrase);
  const psql = spawn(
    'psql',
    [
      '--single-transaction',
      '--quiet',
      '--no-psqlrc',
      '--variable', 'ON_ERROR_STOP=1',
      // 採番や更新日時のトリガーを止め、保存時の値をそのまま戻す。
      '--command', 'SET session_replication_role = replica',
      '--file', '-',
    ],
    { stdio: ['pipe', 'ignore', 'inherit'], env: { ...process.env, ...pgEnv } },
  );
  const finished = exitCode(psql, 'psql');
  // psql が先に失敗して終了すると EPIPE になるので、結果は終了コードで判断する。
  await pipeline(backup.decrypted(), psql.stdin).catch(() => undefined);
  const code = await finished;
  if (code !== 0) fail(`復元に失敗しました（psql の終了コード ${code}）。何も書き込まれていません。`);
  console.log('復元しました。');
}

main().catch((error) => fail(error instanceof Error ? error.message : '復元に失敗しました。'));
