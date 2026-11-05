/** 接続 URL を PG* の環境変数に分ける。URL をコマンドの引数に置かないため（ps で見えてしまう）。 */
export function pgEnvFromUrl(raw, name) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    // 値に秘密が含まれるので、エラーに中身を出さない。
    throw new Error(`環境変数 ${name} の形式が正しくありません。`);
  }
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new Error(`環境変数 ${name} は postgresql:// で始めてください。`);
  }
  const local = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
  return {
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)) || 'postgres',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGSSLMODE: url.searchParams.get('sslmode') ?? (local ? 'prefer' : 'require'),
  };
}

export function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`環境変数 ${name} を設定してください。`);
  return value;
}

/** 子プロセスの終了を待ち、終了コードを返す。起動に失敗したら理由つきで止める。 */
export function exitCode(child, label) {
  return new Promise((resolve, reject) => {
    child.once('error', (error) => reject(new Error(`${label} を起動できませんでした: ${error.code ?? error.message}`)));
    child.once('close', (code) => resolve(code ?? 1));
  });
}
