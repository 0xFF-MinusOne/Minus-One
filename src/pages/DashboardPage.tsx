import { ArrowRight, ArrowUp, CheckCircle2, FolderClosed, ShieldCheck, TriangleAlert, type LucideIcon } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useFindings, useProjects } from '../api/queries';
import { FindingsTable } from '../components/FindingsTable';
import { buildProjectRows, ProjectsTable } from '../components/ProjectsTable';
import { SeverityDonut } from '../components/SeverityDonut';
import { Card, EmptyState, ErrorNote, Loading, PageHeader, useSort } from '../components/ui';
import type { FindingSortKey } from '../lib/filter';
import { errorMessage } from '../lib/errors';
import { computeMetrics, countable, severityBreakdown } from '../lib/stats';

const RECENT_COUNT = 5;

function MetricCard({
  icon: Icon,
  iconClass,
  label,
  value,
  thisWeek,
  note,
}: {
  icon: LucideIcon;
  iconClass: string;
  label: string;
  value: number;
  thisWeek: number;
  note?: string;
}) {
  return (
    <div className="flex gap-4 rounded-xl border border-line bg-white p-5 shadow-card">
      <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-lg ${iconClass}`}>
        <Icon className="h-6 w-6" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="whitespace-nowrap text-sm font-semibold text-ink-soft">{label}</p>
        <p className="mt-0.5 text-3xl font-bold tabular-nums">{value.toLocaleString('ja-JP')}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-ink-soft">
          <span className="inline-flex items-center gap-0.5 whitespace-nowrap">
            {thisWeek > 0 ? <ArrowUp className="h-3.5 w-3.5" aria-hidden /> : null}今週 +
            {thisWeek.toLocaleString('ja-JP')}
          </span>
          {note ? <span className="whitespace-nowrap text-ink-muted">{note}</span> : null}
        </p>
      </div>
    </div>
  );
}

function ViewAll({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-semibold text-brand-700 hover:underline">
      {label}
      <ArrowRight className="h-4 w-4" aria-hidden />
    </Link>
  );
}

export function DashboardPage() {
  const projects = useProjects();
  const findings = useFindings();
  const [sort, toggleSort] = useSort<FindingSortKey>({ key: 'updated_at', direction: 'desc' });

  const projectNames = useMemo(
    () => new Map((projects.data ?? []).map((project) => [project.id, project.name])),
    [projects.data],
  );
  const projectName = useCallback((id: string) => projectNames.get(id) ?? '—', [projectNames]);

  const data = useMemo(() => {
    if (!projects.data || !findings.data) return null;
    const rows = buildProjectRows(projects.data, findings.data);
    return {
      metrics: computeMetrics(projects.data, findings.data),
      breakdown: severityBreakdown(findings.data),
      recentProjects: [...rows]
        .sort((a, b) => b.progress.lastUpdatedAt.localeCompare(a.progress.lastUpdatedAt))
        .slice(0, RECENT_COUNT),
      recentFindings: [...countable(findings.data)]
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .slice(0, RECENT_COUNT),
    };
  }, [projects.data, findings.data]);

  const error = projects.error ?? findings.error;

  return (
    <>
      <PageHeader title="ダッシュボード" description="セキュリティ評価の状況を一目で確認できます。" />
      {error ? <ErrorNote>{errorMessage(error)}</ErrorNote> : null}
      {!data && !error ? <Loading /> : null}
      {data ? (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              icon={FolderClosed}
              iconClass="bg-brand-50 text-brand-600"
              label="進行中のプロジェクト"
              value={data.metrics.activeProjects.value}
              thisWeek={data.metrics.activeProjects.thisWeek}
            />
            <MetricCard
              icon={ShieldCheck}
              iconClass="bg-brand-50 text-brand-600"
              label="検出事項の総数"
              value={data.metrics.totalFindings.value}
              thisWeek={data.metrics.totalFindings.thisWeek}
            />
            <MetricCard
              icon={TriangleAlert}
              iconClass="bg-[#FDEEF0] text-[#C92A45]"
              label="緊急"
              value={data.metrics.criticalFindings.value}
              thisWeek={data.metrics.criticalFindings.thisWeek}
              note={`未解決 ${data.metrics.criticalFindings.unresolved.toLocaleString('ja-JP')}`}
            />
            <MetricCard
              icon={CheckCircle2}
              iconClass="bg-[#E8F7EE] text-[#17663B]"
              label="解決済み"
              value={data.metrics.resolvedFindings.value}
              thisWeek={data.metrics.resolvedFindings.thisWeek}
            />
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
            <Card title="最近のプロジェクト" action={<ViewAll to="/projects" label="すべてのプロジェクトを見る" />}>
              {data.recentProjects.length > 0 ? (
                <ProjectsTable rows={data.recentProjects} />
              ) : (
                <EmptyState title="プロジェクトはまだありません。">
                  右上の「新規プロジェクト」から作成できます。
                </EmptyState>
              )}
            </Card>
            <Card title="検出事項の内訳">
              <SeverityDonut counts={data.breakdown} />
            </Card>
          </div>

          <Card title="最近の検出事項" action={<ViewAll to="/findings" label="すべての検出事項を見る" />}>
            {data.recentFindings.length > 0 ? (
              <FindingsTable
                findings={data.recentFindings}
                projectName={projectName}
                sort={sort}
                onSort={toggleSort}
                showTracking={false}
              />
            ) : (
              <EmptyState title="検出事項はまだありません。" />
            )}
          </Card>
        </div>
      ) : null}
    </>
  );
}
