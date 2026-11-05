import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { isAbsolute, parse, sep } from 'node:path';
import { MAX_TRIVY_FILE_BYTES } from '../../src/lib/trivy';

export class ImportPathError extends Error {}

const REFUSED = 'このファイルは取り込めません。PENTEST_MCP_IMPORT_DIR の配下にある 20MB 以下の .json だけを指定できます。';

/**
 * 許可されたフォルダの中の JSON だけを読む。
 * シンボリックリンクを解決してから判定し、読むときも解決後のパスをリンクを辿らずに開く。
 * 存在の有無を探れないよう、拒否の理由はすべて同じメッセージにする。
 */
export async function readImportFile(requested: string, importDir: string | null): Promise<string> {
  if (!importDir) throw new ImportPathError('Trivy の取り込みは無効です（PENTEST_MCP_IMPORT_DIR が未設定）。');
  if (!isAbsolute(requested) || requested.includes('\0')) throw new ImportPathError(REFUSED);

  let handle;
  try {
    const root = await realpath(importDir);
    if (parse(root).root === root) throw new ImportPathError('PENTEST_MCP_IMPORT_DIR にルートは指定できません。');
    const real = await realpath(requested);
    if (!real.startsWith(root + sep) || !real.toLowerCase().endsWith('.json')) throw new ImportPathError(REFUSED);

    // O_NONBLOCK: 名前付きパイプなどを開いても止まらないようにする。
    handle = await open(real, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const info = await handle.stat();
    if (!info.isFile() || info.size > MAX_TRIVY_FILE_BYTES) throw new ImportPathError(REFUSED);
    return await handle.readFile('utf8');
  } catch (error) {
    if (error instanceof ImportPathError) throw error;
    throw new ImportPathError(REFUSED);
  } finally {
    await handle?.close();
  }
}
