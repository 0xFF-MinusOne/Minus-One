import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { MAX_TRIVY_FILE_BYTES } from '../../src/lib/trivy';
import { ImportPathError, readImportFile } from './importPath';

const base = realpathSync(mkdtempSync(join(tmpdir(), 'pentest-import-')));
const allowed = join(base, 'allowed');
const outside = join(base, 'outside');
mkdirSync(allowed);
mkdirSync(outside);
afterAll(() => rmSync(base, { recursive: true, force: true }));

const inside = join(allowed, 'scan.json');
writeFileSync(inside, '{"ok":true}');
writeFileSync(join(allowed, 'UPPER.JSON'), '{"upper":true}');
writeFileSync(join(allowed, 'notes.txt'), 'x');
const secret = join(outside, 'secret.json');
writeFileSync(secret, '{"secret":true}');
symlinkSync(secret, join(allowed, 'link.json'));
symlinkSync(outside, join(allowed, 'linkdir'));
symlinkSync(join(outside, 'secret.json'), join(allowed, 'renamed.txt'));
symlinkSync(inside, join(allowed, 'inner-link.json'));
execFileSync('mkfifo', [join(allowed, 'pipe.json')]);
const big = join(allowed, 'big.json');
writeFileSync(big, '');
truncateSync(big, MAX_TRIVY_FILE_BYTES + 1);

describe('readImportFile', () => {
  it('配下の .json を読む', async () => {
    await expect(readImportFile(inside, allowed)).resolves.toBe('{"ok":true}');
    await expect(readImportFile(join(allowed, 'UPPER.JSON'), allowed)).resolves.toContain('upper');
  });

  it('配下を指すリンクは読める', async () => {
    await expect(readImportFile(join(allowed, 'inner-link.json'), allowed)).resolves.toContain('ok');
  });

  it('フォルダがシンボリックリンク経由でも、解決後で判定する', async () => {
    const linkRoot = join(base, 'root-link');
    symlinkSync(allowed, linkRoot);
    await expect(readImportFile(join(linkRoot, 'scan.json'), linkRoot)).resolves.toContain('ok');
  });

  it('未設定なら無効', async () => {
    await expect(readImportFile(inside, null)).rejects.toThrow(/無効/);
  });

  it.each([
    ['外のファイル', secret],
    ['外を指すリンク', join(allowed, 'link.json')],
    ['外のフォルダを指すリンク', join(allowed, 'linkdir', 'secret.json')],
    ['.. でのすり抜け', join(allowed, '..', 'outside', 'secret.json')],
    ['.json 以外', join(allowed, 'notes.txt')],
    ['外を指す .txt のリンク', join(allowed, 'renamed.txt')],
    ['名前付きパイプ', join(allowed, 'pipe.json')],
    ['20MB を超えるファイル', big],
    ['存在しないファイル', join(allowed, 'none.json')],
    ['フォルダ', allowed],
    ['相対パス', 'scan.json'],
    ['システムのファイル', '/etc/passwd'],
  ])('%s を拒否する', async (_label, path) => {
    await expect(readImportFile(path, allowed)).rejects.toBeInstanceOf(ImportPathError);
  });

  it('存在の有無を区別できない', async () => {
    const messages = await Promise.all(
      [secret, join(outside, 'none.json')].map((path) => readImportFile(path, allowed).catch((error: Error) => error.message)),
    );
    expect(messages[0]).toBe(messages[1]);
  });

  it('拒否のメッセージにパスや内容を出さない', async () => {
    const message = await readImportFile(secret, allowed).catch((error: Error) => error.message);
    expect(message).not.toContain(base);
    expect(message).not.toContain('secret');
  });

  it('ルートは許可フォルダにできない', async () => {
    await expect(readImportFile('/etc/hosts.json', '/')).rejects.toBeInstanceOf(ImportPathError);
  });
});
