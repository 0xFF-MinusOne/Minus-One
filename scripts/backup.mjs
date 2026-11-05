#!/usr/bin/env node
// public スキーマのデータを pg_dump で取り、暗号化して保存する。
// 平文はパイプの中を流れるだけで、ファイルに書かない。
//
//   SUPABASE_DB_URL     接続先（postgresql://...）
//   BACKUP_PASSPHRASE   暗号化のパスフレーズ（12 文字以上）
//
//   node scripts/backup.mjs <保存先フォルダ（リポジトリの外）>
import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, realpathSync, renameSync, rmSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { createEncryptStream, verifyBackup } from './backup-crypto.mjs';
import { exitCode, pgEnvFromUrl, requireEnv } from './pg-env.mjs';

function fail(message) {
  console.error(message);
  process.exit(1);
}

function outputDirectory(argument) {
  if (!argument) fail('使い方: node scripts/backup.mjs <保存先フォルダ（リポジトリの外）>');
  const target = resolve(argument);
  mkdirSync(target, { recursive: true, mode: 0o700 });
  const real = realpathSync(target);
  const repo = realpathSync(fileURLToPath(new URL('..', import.meta.url))).replace(/[/\\]$/, '');
  if (real === repo || real.startsWith(repo + sep)) fail('保存先はリポジトリの外を指定してください。');
  return real;
}

async function main() {
  const dir = outputDirectory(process.argv[2]);
  const pgEnv = pgEnvFromUrl(requireEnv('SUPABASE_DB_URL'), 'SUPABASE_DB_URL');
  const passphrase = requireEnv('BACKUP_PASSPHRASE');
  if (passphrase.length < 12) fail('BACKUP_PASSPHRASE は 12 文字以上にしてください。');

  process.umask(0o077);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');
  const file = join(dir, `pentest-dashboard-public-${stamp}.sql.enc`);
  const partial = `${file}.partial`;
  if (existsSync(file)) fail('同じ名前のバックアップが既にあります。少し待ってからもう一度実行してください。');

  // 鍵の導出に時間がかかる。pg_dump の起動より先に済ませる。読み手がいないまま子プロセスが
  // 終わると、Node がその出力を捨ててしまう。
  const encrypt = await createEncryptStream(passphrase);
  const dump = spawn(
    'pg_dump',
    ['--data-only', '--schema=public', '--no-owner', '--no-privileges', '--encoding=UTF8'],
    { stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, ...pgEnv } },
  );
  const dumpFinished = exitCode(dump, 'pg_dump');

  try {
    const [, code] = await Promise.all([
      pipeline(dump.stdout, encrypt, createWriteStream(partial, { flags: 'wx', mode: 0o600 })),
      dumpFinished,
    ]);
    if (code !== 0) throw new Error(`pg_dump が失敗しました（終了コード ${code}）。`);
    if (!(await verifyBackup(partial, passphrase)).includes('PostgreSQL database dump')) {
      throw new Error('暗号化したファイルの中身を確認できませんでした。');
    }
    renameSync(partial, file);
  } catch (error) {
    rmSync(partial, { force: true });
    throw error;
  }
  console.log(`保存しました: ${file}（${statSync(file).size.toLocaleString('ja-JP')} バイト）`);
}

main().catch((error) => fail(error instanceof Error ? error.message : 'バックアップに失敗しました。'));
