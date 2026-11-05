import {
  SEVERITIES,
  FINDING_STATUSES,
  REPORT_STATUSES,
  VERIFICATION_STATUSES,
  type FindingListItem,
  type FindingStatus,
  type ReportStatus,
  type Severity,
  type VerificationStatus,
} from './domain';

export interface FindingFilters {
  projectId?: string | null;
  severity?: Severity | null;
  status?: FindingStatus | null;
  verification?: VerificationStatus | null;
  report?: ReportStatus | null;
  query?: string;
}

function normalize(value: string): string {
  return value.normalize('NFKC').toLowerCase();
}

export function matchesQuery(
  query: string,
  fields: ReadonlyArray<string | null | undefined>,
): boolean {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = normalize(fields.filter(Boolean).join('\n'));
  return terms.every((term) => haystack.includes(term));
}

export function findingSearchFields(finding: FindingListItem): Array<string | null> {
  return [
    finding.ref_id,
    finding.title,
    finding.cve,
    finding.cwe,
    finding.affected_location,
    finding.source_rule_id,
  ];
}

export function filterFindings<T extends FindingListItem>(
  findings: readonly T[],
  filters: FindingFilters,
): T[] {
  return findings.filter(
    (finding) =>
      (!filters.projectId || finding.project_id === filters.projectId) &&
      (!filters.severity || finding.severity === filters.severity) &&
      (!filters.status || finding.status === filters.status) &&
      (!filters.verification || finding.verification_status === filters.verification) &&
      (!filters.report || finding.report_status === filters.report) &&
      (!filters.query || matchesQuery(filters.query, findingSearchFields(finding))),
  );
}

export type SortDirection = 'asc' | 'desc';
export interface SortState<K extends string> {
  key: K;
  direction: SortDirection;
}

export type FindingSortKey =
  | 'ref_id'
  | 'title'
  | 'severity'
  | 'project'
  | 'status'
  | 'verification_status'
  | 'report_status'
  | 'created_at'
  | 'updated_at';

export function compareText(a: string, b: string): number {
  return a.localeCompare(b, 'ja');
}

/** 定義順（緊急→情報 など）で比べるための順位。 */
function rank<T>(list: readonly T[], value: T): number {
  return list.indexOf(value);
}

export function sortFindings<T extends FindingListItem>(
  findings: readonly T[],
  sort: SortState<FindingSortKey>,
  projectName: (projectId: string) => string = () => '',
): T[] {
  const sign = sort.direction === 'asc' ? 1 : -1;
  const compare = (a: T, b: T): number => {
    switch (sort.key) {
      case 'ref_id':
        return a.seq - b.seq;
      case 'title':
        return compareText(a.title, b.title);
      case 'severity':
        return rank(SEVERITIES, a.severity) - rank(SEVERITIES, b.severity);
      case 'project':
        return compareText(projectName(a.project_id), projectName(b.project_id));
      case 'status':
        return rank(FINDING_STATUSES, a.status) - rank(FINDING_STATUSES, b.status);
      case 'verification_status':
        return (
          rank(VERIFICATION_STATUSES, a.verification_status) -
          rank(VERIFICATION_STATUSES, b.verification_status)
        );
      case 'report_status':
        return rank(REPORT_STATUSES, a.report_status) - rank(REPORT_STATUSES, b.report_status);
      case 'created_at':
        return a.created_at.localeCompare(b.created_at);
      case 'updated_at':
        return a.updated_at.localeCompare(b.updated_at);
    }
  };
  // 同順位は新しい ID を先にして、表示順を安定させる。
  return [...findings].sort((a, b) => sign * compare(a, b) || b.seq - a.seq);
}
