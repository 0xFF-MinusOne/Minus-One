export const MIN_PASSWORD_LENGTH = 12;

/** 新しいパスワードの入力を確かめる。問題なければ null。 */
export function validateNewPassword(password: string, confirmation: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `パスワードは ${MIN_PASSWORD_LENGTH} 文字以上にしてください。`;
  }
  if (password !== confirmation) return '確認用のパスワードが一致しません。';
  return null;
}

/** Supabase Auth のエラーコードを、画面に出せる日本語にする。 */
export function passwordErrorMessage(code: string | undefined): string {
  switch (code) {
    case 'same_password':
      return '今のパスワードとは別のものを入力してください。';
    case 'weak_password':
      return 'このパスワードは使えません。より長く推測されにくいものにしてください。';
    case 'insufficient_aal':
      return '2 段階認証を済ませてから、もう一度お試しください。';
    default:
      return 'パスワードを変更できませんでした。時間をおいてもう一度お試しください。';
  }
}
