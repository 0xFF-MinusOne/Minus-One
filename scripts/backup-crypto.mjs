// バックアップの暗号化。Node の標準機能だけを使う（AES-256-GCM、鍵は scrypt で導出）。
// 形式: MAGIC(6) | salt(16) | nonce(12) | 暗号文 | 認証タグ(16)
import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open } from 'node:fs/promises';
import { Transform } from 'node:stream';

const MAGIC = Buffer.from('PDBK1\n');
const SALT_LENGTH = 16;
const NONCE_LENGTH = 12;
const TAG_LENGTH = 16;
const HEADER_LENGTH = MAGIC.length + SALT_LENGTH + NONCE_LENGTH;
const SCRYPT = { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };

function deriveKey(passphrase, salt) {
  return new Promise((resolve, reject) => {
    scrypt(passphrase, salt, 32, SCRYPT, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

/** 平文を受け取り、暗号化したファイルの中身を流す Transform を作る。 */
export async function createEncryptStream(passphrase) {
  const salt = randomBytes(SALT_LENGTH);
  const nonce = randomBytes(NONCE_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', await deriveKey(passphrase, salt), nonce);
  let started = false;
  return new Transform({
    transform(chunk, _encoding, callback) {
      if (!started) {
        started = true;
        this.push(Buffer.concat([MAGIC, salt, nonce]));
      }
      callback(null, cipher.update(chunk));
    },
    flush(callback) {
      if (!started) this.push(Buffer.concat([MAGIC, salt, nonce]));
      this.push(cipher.final());
      this.push(cipher.getAuthTag());
      callback();
    },
  });
}

/**
 * バックアップを開く。decrypted() は呼ぶたびに新しい平文のストリームを返す。
 * 認証タグの確認は最後に行われるので、流す前に一度 decrypted() を最後まで読んで確かめること。
 */
export async function openBackup(file, passphrase) {
  const handle = await open(file, 'r');
  let header;
  let tag;
  let size;
  try {
    ({ size } = await handle.stat());
    if (size < HEADER_LENGTH + TAG_LENGTH) throw new Error('バックアップの形式が正しくありません。');
    header = Buffer.alloc(HEADER_LENGTH);
    await handle.read(header, 0, HEADER_LENGTH, 0);
    tag = Buffer.alloc(TAG_LENGTH);
    await handle.read(tag, 0, TAG_LENGTH, size - TAG_LENGTH);
  } finally {
    await handle.close();
  }
  if (!header.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('バックアップの形式が正しくありません。');

  const salt = header.subarray(MAGIC.length, MAGIC.length + SALT_LENGTH);
  const nonce = header.subarray(MAGIC.length + SALT_LENGTH);
  const key = await deriveKey(passphrase, salt);

  return {
    decrypted() {
      const decipher = createDecipheriv('aes-256-gcm', key, nonce);
      decipher.setAuthTag(tag);
      if (size === HEADER_LENGTH + TAG_LENGTH) {
        queueMicrotask(() => decipher.end());
        return decipher;
      }
      const source = createReadStream(file, { start: HEADER_LENGTH, end: size - TAG_LENGTH - 1 });
      source.on('error', (error) => decipher.destroy(error));
      return source.pipe(decipher);
    },
  };
}

/** 平文を保存せずに最後まで復号し、改ざんや誤ったパスフレーズを検出する。先頭だけを返す。 */
export async function verifyBackup(file, passphrase) {
  const backup = await openBackup(file, passphrase);
  let head = Buffer.alloc(0);
  for await (const chunk of backup.decrypted()) {
    if (head.length < 200) head = Buffer.concat([head, chunk]).subarray(0, 200);
  }
  return head.toString('utf8');
}
