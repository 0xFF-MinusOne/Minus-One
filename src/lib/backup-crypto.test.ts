import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
// @ts-expect-error 型定義のない運用スクリプト
import { createEncryptStream, verifyBackup } from '../../scripts/backup-crypto.mjs';

const dir = mkdtempSync(join(tmpdir(), 'pentest-backup-test-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

async function encrypt(name: string, text: string, passphrase: string): Promise<string> {
  const file = join(dir, name);
  await pipeline(Readable.from([Buffer.from(text)]), await createEncryptStream(passphrase), createWriteStream(file));
  return file;
}

describe('バックアップの暗号化', () => {
  const secretText = '-- PostgreSQL database dump\n秘密のデータ\n';

  it('平文がファイルに残らず、同じパスフレーズで戻せる', async () => {
    const file = await encrypt('a', secretText, 'correct horse battery');
    expect(readFileSync(file).includes(Buffer.from('秘密のデータ'))).toBe(false);
    expect(await verifyBackup(file, 'correct horse battery')).toContain('PostgreSQL database dump');
  });

  it('パスフレーズが違うと失敗する', async () => {
    const file = await encrypt('b', secretText, 'correct horse battery');
    await expect(verifyBackup(file, 'wrong passphrase!!')).rejects.toThrow();
  });

  it('改ざんを検出する', async () => {
    const file = await encrypt('c', secretText, 'correct horse battery');
    const bytes = readFileSync(file);
    bytes[40] = (bytes[40] ?? 0) ^ 0xff;
    writeFileSync(file, bytes);
    await expect(verifyBackup(file, 'correct horse battery')).rejects.toThrow();
  });
});
