import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { FindingListItem, Project } from '../lib/domain';
import { compareText, type SortState } from '../lib/filter';
import { formatDate } from '../lib/format';
import { groupByProject, projectProgress, type ProjectProgress } from '../lib/stats';
import { ProjectRowActions } from './RowActions';
import { ProgressCell, SortHeader, useSort } from './ui';

export type ProjectSortKey = 'name' | 'client' | 'progress' | 'count' | 'updated';

export interface ProjectRow {
  project: Project;
  progress: ProjectProgress;
}

export function buildProjectRows(projects: readonly Project[], findings: readonly FindingListItem[]): ProjectRow[] {
  const groups = groupByProject(findings);
  return projects.map((project) => ({
    project,
    progress: projectProgress(project, groups.get(project.id) ?? []),
  }));
}

/** 完了は進捗 100 として並べる。検出事項が無いものは一番下。 */
function progressRank(row: ProjectRow): number {
  return row.project.status === 'completed' ? 101 : (row.progress.percent ?? -1);
}

function sortRows(rows: readonly ProjectRow[], sort: SortState<ProjectSortKey>): ProjectRow[] {
  const sign = sort.direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    switch (sort.key) {
      case 'name':
        return sign * compareText(a.project.name, b.project.name);
      case 'client':
        return sign * compareText(a.project.client ?? '', b.project.client ?? '');
      case 'progress':
        return sign * (progressRank(a) - progressRank(b));
      case 'count':
        return sign * (a.progress.findingCount - b.progress.findingCount);
      case 'updated':
        return sign * a.progress.lastUpdatedAt.localeCompare(b.progress.lastUpdatedAt);
    }
  });
}

export function ProjectsTable({ rows }: { rows: readonly ProjectRow[] }) {
  const [sort, toggle] = useSort<ProjectSortKey>({ key: 'updated', direction: 'desc' });
  const sorted = useMemo(() => sortRows(rows, sort), [rows, sort]);
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <SortHeader label="プロジェクト名" sortKey="name" sort={sort} onSort={toggle} />
            <SortHeader label="クライアント" sortKey="client" sort={sort} onSort={toggle} />
            <SortHeader label="進捗" sortKey="progress" sort={sort} onSort={toggle} />
            <SortHeader label="検出事項" sortKey="count" sort={sort} onSort={toggle} />
            <SortHeader label="更新日" sortKey="updated" sort={sort} onSort={toggle} />
            <th aria-label="操作" />
          </tr>
        </thead>
        <tbody>
          {sorted.map(({ project, progress }) => (
            <tr key={project.id}>
              <td>
                <div className="cell-text !max-w-[18rem]">
                  <Link to={`/projects/${project.id}`} className="font-semibold text-brand-700 hover:underline">
                    {project.name}
                  </Link>
                </div>
              </td>
              <td>
                <div className="cell-text !max-w-[14rem] text-ink-soft">{project.client ?? '—'}</div>
              </td>
              <td>
                <ProgressCell completed={project.status === 'completed'} percent={progress.percent} />
              </td>
              <td className="tabular-nums">{progress.findingCount.toLocaleString('ja-JP')}</td>
              <td className="whitespace-nowrap tabular-nums text-ink-soft">{formatDate(progress.lastUpdatedAt)}</td>
              <td className="text-right">
                <ProjectRowActions project={project} findingCount={progress.allFindingCount} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
