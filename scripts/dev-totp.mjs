// 開発用アカウントの今の確認コードを表示する。.dev-login.local の秘密鍵を使う。
import { readFileSync } from 'node:fs';
import { generateTotp } from './totp.mjs';

const secret = /^totp_secret=(.+)$/m.exec(readFileSync('.dev-login.local', 'utf8'))?.[1];
if (!secret) throw new Error('.dev-login.local に totp_secret がありません。npm run setup:dev を実行してください。');
const remaining = 30 - (Math.floor(Date.now() / 1000) % 30);
console.log(`${generateTotp(secret)}（あと ${remaining} 秒）`);
