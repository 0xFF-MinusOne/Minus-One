import { describe, expect, it } from 'vitest';
import { passwordErrorMessage, validateNewPassword } from './password';

describe('validateNewPassword', () => {
  it('12 文字未満を拒否する', () => {
    expect(validateNewPassword('a'.repeat(11), 'a'.repeat(11))).toMatch(/12 文字以上/);
  });

  it('確認入力の不一致を拒否する', () => {
    expect(validateNewPassword('a'.repeat(12), 'b'.repeat(12))).toMatch(/一致しません/);
  });

  it('12 文字以上で一致すれば通す', () => {
    expect(validateNewPassword('a'.repeat(12), 'a'.repeat(12))).toBeNull();
  });
});

describe('passwordErrorMessage', () => {
  it('Auth のエラーコードを日本語にする', () => {
    expect(passwordErrorMessage('same_password')).toMatch(/別のもの/);
    expect(passwordErrorMessage('insufficient_aal')).toMatch(/2 段階認証/);
    expect(passwordErrorMessage(undefined)).toMatch(/変更できませんでした/);
  });
});
