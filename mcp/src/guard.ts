import type { Finding, ReportStatus } from '../../src/lib/domain';

export const GUARDED_TEXT_LIMIT = 500;

/** 修正や公開が済んでいない報告状況。詳細はクラウドに置かない。 */
const SENSITIVE_REPORT_STATUSES: ReadonlySet<ReportStatus> = new Set(['not_reported', 'reported', 'accepted']);

const LIMITED_FIELDS = ['description', 'impact', 'remediation'] as const;
type LimitedField = (typeof LIMITED_FIELDS)[number];

export type GuardFields = Pick<Finding, LimitedField | 'reproduction_steps' | 'report_status'>;

export class GuardError extends Error {}

function textLength(value: string): number {
  return Array.from(value).length;
}

function filled(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * 変更後の状態で判定する。
 * 今回入力した項目と、報告状況が「未報告」などに変わるときの既存の値を確かめる。
 * 画面から入った既存の値は、関係のない更新（ステータスの変更など）を妨げない。
 */
export function checkFindingGuard(input: Partial<GuardFields>, current?: GuardFields): void {
  const finalStatus: ReportStatus = input.report_status ?? current?.report_status ?? 'not_reported';
  if (!SENSITIVE_REPORT_STATUSES.has(finalStatus)) return;

  const entering = !current || !SENSITIVE_REPORT_STATUSES.has(current.report_status);
  const applies = (field: keyof GuardFields) => entering || input[field] !== undefined;
  const finalValue = (field: 'reproduction_steps' | LimitedField) =>
    input[field] !== undefined ? input[field] : current?.[field];

  if (applies('reproduction_steps') && filled(finalValue('reproduction_steps'))) {
    throw new GuardError(
      '報告状況が not_reported / reported / accepted の間は reproduction_steps を保存できません。詳細は手元で管理し、local_reference に参照を記録してください。',
    );
  }
  for (const field of LIMITED_FIELDS) {
    const value = finalValue(field);
    if (applies(field) && filled(value) && textLength(value) > GUARDED_TEXT_LIMIT) {
      throw new GuardError(
        `報告状況が not_reported / reported / accepted の間は ${field} を ${GUARDED_TEXT_LIMIT} 文字以内にしてください。`,
      );
    }
  }
}

/** Trivy の取り込みは常に未報告で入るので、長い本文は上限で切る。 */
export function truncateGuardedText(value: string | null): { value: string | null; truncated: boolean } {
  if (value === null || textLength(value) <= GUARDED_TEXT_LIMIT) return { value, truncated: false };
  return { value: Array.from(value).slice(0, GUARDED_TEXT_LIMIT).join(''), truncated: true };
}
