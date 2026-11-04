import { describe, expect, it } from 'vitest';
import { checkFindingGuard, GuardError, GUARDED_TEXT_LIMIT, truncateGuardedText, type GuardFields } from './guard';

const row = (overrides: Partial<GuardFields> = {}): GuardFields => ({
  report_status: 'not_reported',
  reproduction_steps: null,
  description: null,
  impact: null,
  remediation: null,
  ...overrides,
});
const long = 'あ'.repeat(GUARDED_TEXT_LIMIT + 1);

describe('checkFindingGuard: 作成', () => {
  it('既定（未報告）の再現手順を拒否する', () => {
    expect(() => checkFindingGuard({ reproduction_steps: '手順' })).toThrow(GuardError);
  });

  it.each(['not_reported', 'reported', 'accepted'] as const)('%s の再現手順を拒否する', (report_status) => {
    expect(() => checkFindingGuard({ report_status, reproduction_steps: '手順' })).toThrow(GuardError);
  });

  it.each(['fixed', 'disclosed', 'not_applicable'] as const)('%s は通常どおり入力できる', (report_status) => {
    expect(() => checkFindingGuard({ report_status, reproduction_steps: '手順', description: long })).not.toThrow();
  });

  it('空白だけの再現手順は入力として数えない', () => {
    expect(() => checkFindingGuard({ reproduction_steps: '   ' })).not.toThrow();
  });

  it.each(['description', 'impact', 'remediation'] as const)('%s は 500 文字まで', (field) => {
    expect(() => checkFindingGuard({ [field]: 'あ'.repeat(GUARDED_TEXT_LIMIT) })).not.toThrow();
    expect(() => checkFindingGuard({ [field]: long })).toThrow(GuardError);
  });
});

describe('checkFindingGuard: 更新は最終状態で判定する', () => {
  it('未報告のまま再現手順を入れると拒否する', () => {
    expect(() => checkFindingGuard({ reproduction_steps: '手順' }, row())).toThrow(GuardError);
  });

  it('修正済みに変えて同時に入れるのは通す', () => {
    expect(() => checkFindingGuard({ report_status: 'fixed', reproduction_steps: '手順' }, row())).not.toThrow();
  });

  it('修正済みから報告済みに戻して同時に入れると拒否する', () => {
    const current = row({ report_status: 'fixed' });
    expect(() => checkFindingGuard({ report_status: 'reported', reproduction_steps: '手順' }, current)).toThrow(GuardError);
  });

  it('修正済みの間は再現手順を入れられる', () => {
    expect(() => checkFindingGuard({ reproduction_steps: '手順' }, row({ report_status: 'fixed' }))).not.toThrow();
  });

  it('再現手順が残ったまま未報告に戻すと拒否する', () => {
    const current = row({ report_status: 'fixed', reproduction_steps: '手順' });
    expect(() => checkFindingGuard({ report_status: 'not_reported' }, current)).toThrow(GuardError);
  });

  it('未報告に戻すときに再現手順を消せば通す', () => {
    const current = row({ report_status: 'fixed', reproduction_steps: '手順' });
    expect(() => checkFindingGuard({ report_status: 'not_reported', reproduction_steps: null }, current)).not.toThrow();
  });

  it('長い本文が残ったまま未報告に戻すと拒否する', () => {
    const current = row({ report_status: 'fixed', impact: long });
    expect(() => checkFindingGuard({ report_status: 'accepted' }, current)).toThrow(GuardError);
  });

  it('画面から入った既存の値は、関係のない更新を妨げない', () => {
    const current = row({ reproduction_steps: '画面から入力', description: long });
    expect(() => checkFindingGuard({ impact: '短い' }, current)).not.toThrow();
  });

  it('未報告の間に報告状況だけを変えても、既存の値は妨げない', () => {
    const current = row({ reproduction_steps: '画面から入力' });
    expect(() => checkFindingGuard({ report_status: 'reported' }, current)).not.toThrow();
  });
});

describe('truncateGuardedText', () => {
  it('上限で切り、絵文字を壊さない', () => {
    const { value, truncated } = truncateGuardedText('😀'.repeat(GUARDED_TEXT_LIMIT + 5));
    expect(truncated).toBe(true);
    expect(Array.from(value ?? '')).toHaveLength(GUARDED_TEXT_LIMIT);
    expect(value?.endsWith('😀')).toBe(true);
  });

  it('上限以内と null はそのまま', () => {
    expect(truncateGuardedText('短い')).toEqual({ value: '短い', truncated: false });
    expect(truncateGuardedText(null)).toEqual({ value: null, truncated: false });
  });
});
