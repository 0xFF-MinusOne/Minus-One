import {
  SEVERITIES,
  type FindingListItem,
  type FindingStatus,
  type Project,
  type Severity,
} from './domain';

type StatFinding = Pick<FindingListItem, 'project_id' | 'severity' | 'status' | 'created_at' | 'resolved_at' | 'updated_at'>;
type StatProject = Pick<Project, 'id' | 'status' | 'created_at' | 'updated_at'>;

/** 進捗の分子に入る、対応が終わったステータス。 */
const CLOSED_STATUSES: ReadonlySet<FindingStatus> = new Set(['resolved', 'risk_accepted']);

/** その時刻が属する週の月曜 0 時（端末のタイムゾーン）。 */
export function startOfWeek(now: Date): Date {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const daysSinceMonday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - daysSinceMonday);
  return start;
}

function inWeek(value: string | null, weekStart: Date): boolean {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time >= weekStart.getTime();
}

export interface Metric {
  value: number;
  /** 今週増えた数。 */
  thisWeek: number;
}

export interface DashboardMetrics {
  activeProjects: Metric;
  totalFindings: Metric;
  criticalFindings: Metric & { unresolved: number };
  resolvedFindings: Metric;
}

export function countable<T extends Pick<StatFinding, 'status'>>(findings: readonly T[]): T[] {
  return findings.filter((finding) => finding.status !== 'false_positive');
}

export function computeMetrics(
  projects: readonly StatProject[],
  findings: readonly StatFinding[],
  now: Date = new Date(),
): DashboardMetrics {
  const weekStart = startOfWeek(now);
  const active = projects.filter((project) => project.status === 'active');
  const counted = countable(findings);
  const critical = counted.filter((finding) => finding.severity === 'critical');
  const resolved = counted.filter((finding) => finding.status === 'resolved');

  return {
    activeProjects: {
      value: active.length,
      thisWeek: active.filter((project) => inWeek(project.created_at, weekStart)).length,
    },
    totalFindings: {
      value: counted.length,
      thisWeek: counted.filter((finding) => inWeek(finding.created_at, weekStart)).length,
    },
    criticalFindings: {
      value: critical.length,
      thisWeek: critical.filter((finding) => inWeek(finding.created_at, weekStart)).length,
      unresolved: critical.filter((finding) => !CLOSED_STATUSES.has(finding.status)).length,
    },
    resolvedFindings: {
      value: resolved.length,
      thisWeek: resolved.filter((finding) => inWeek(finding.resolved_at, weekStart)).length,
    },
  };
}

export type SeverityCounts = Record<Severity, number>;

export function severityBreakdown(findings: readonly Pick<StatFinding, 'severity' | 'status'>[]): SeverityCounts {
  const counts: SeverityCounts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const finding of countable(findings)) counts[finding.severity] += 1;
  return counts;
}

export function totalOf(counts: SeverityCounts): number {
  return SEVERITIES.reduce((sum, severity) => sum + counts[severity], 0);
}

export interface ProjectProgress {
  /** 誤検知を除いた検出事項の数。 */
  findingCount: number;
  /** 誤検知も含む、紐づくすべての検出事項の数（削除の確認で使う）。 */
  allFindingCount: number;
  /** 0〜100。検出事項が無ければ null。すべて終わるまで 100 にはしない。 */
  percent: number | null;
  /** プロジェクト自身と検出事項のうち、最後に更新された時刻。 */
  lastUpdatedAt: string;
}

export function projectProgress(
  project: Pick<StatProject, 'updated_at'>,
  findings: readonly Pick<StatFinding, 'status' | 'updated_at'>[],
): ProjectProgress {
  const counted = countable(findings);
  const closed = counted.filter((finding) => CLOSED_STATUSES.has(finding.status)).length;
  const lastUpdatedAt = findings.reduce(
    (latest, finding) => (finding.updated_at > latest ? finding.updated_at : latest),
    project.updated_at,
  );
  return {
    findingCount: counted.length,
    allFindingCount: findings.length,
    percent: counted.length === 0 ? null : Math.floor((closed / counted.length) * 100),
    lastUpdatedAt,
  };
}

export function groupByProject<T extends { project_id: string }>(findings: readonly T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const finding of findings) {
    const group = groups.get(finding.project_id);
    if (group) group.push(finding);
    else groups.set(finding.project_id, [finding]);
  }
  return groups;
}
