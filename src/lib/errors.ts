interface MaybeDbError {
  code?: unknown;
  message?: unknown;
}

/** DB や通信のエラーを、画面に出せる日本語にする。 */
export function errorMessage(error: unknown): string {
  const { code, message } = (error ?? {}) as MaybeDbError;
  switch (code) {
    case '23503':
      return 'このプロジェクトには紐づけられません。';
    case '23505':
      return '同じ内容の検出事項が既にあります。';
    case '23514':
      return '入力内容に誤りがあります（URL の形式、日付の順序、スコアの範囲などを確認してください）。';
    case '22P02':
      return '入力の形式が正しくありません。';
    case 'P0002':
      return 'プロジェクトが見つかりません。削除された可能性があります。';
    case '42501':
      return 'この操作の権限がありません。';
    case 'PGRST116':
      return '対象が見つかりません。削除された可能性があります。';
    case 'MO001':
      return '有効な管理者が 1 人もいなくなる変更はできません。';
    case '57014':
      return '処理に時間がかかりすぎて中止されました。ファイルを分けてお試しください。';
  }
  if (typeof message === 'string' && /fetch|network/i.test(message)) {
    return 'サーバーに接続できませんでした。';
  }
  return '処理に失敗しました。時間をおいてもう一度お試しください。';
}
