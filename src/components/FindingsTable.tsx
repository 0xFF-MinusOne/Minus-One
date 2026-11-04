import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { FindingListItem } from '../lib/domain';
import { sortFindings, type FindingSortKey, type SortState } from '../lib/filter';
import { formatDate } from '../lib/format';
import { FindingRowActions } from './RowActions';
import { ReportBadge, SeverityBadge, SortHeader, StatusBadge, VerificationBadge } from './ui';

export function FindingsTable({
  findings,
  projectName,
  sort,
  onSort,
  showProject = true,
  showTracking = true,
}: {
  findings: readonly FindingListItem[];
  projectName: (projectId: string) => string;
  sort: SortState<FindingSortKey>;
  onSort: (key: FindingSortKey) => void;
  showProject?: boolean;
  /** 検証状況と報告状況の列。 */
  showTracking?: boolean;
}) {
  const sorted = useMemo(() => sortFindings(findings, sort, projectName), [findings, sort, projectName]);
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <SortHeader label="ID" sortKey="ref_id" sort={sort} onSort={onSort} />
            <SortHeader label="タイトル" sortKey="title" sort={sort} onSort={onSort} />
            <SortHeader label="深刻度" sortKey="severity" sort={sort} onSort={onSort} />
            {showProject ? <SortHeader label="プロジェクト" sortKey="project" sort={sort} onSort={onSort} /> : null}
            <SortHeader label="ステータス" sortKey="status" sort={sort} onSort={onSort} />
            {showTracking ? (
              <>
                <SortHeader label="検証状況" sortKey="verification_status" sort={sort} onSort={onSort} />
                <SortHeader label="報告状況" sortKey="report_status" sort={sort} onSort={onSort} />
              </>
            ) : null}
            <SortHeader label="更新日" sortKey="updated_at" sort={sort} onSort={onSort} />
            <th aria-label="操作" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((finding) => (
            <tr key={finding.id}>
              <td className="whitespace-nowrap font-mono">
                <Link to={`/findings/${finding.id}`} className="font-semibold text-brand-700 hover:underline">
                  {finding.ref_id}
                </Link>
              </td>
              <td>
                <div className="cell-text">{finding.title}</div>
              </td>
              <td>
                <SeverityBadge severity={finding.severity} />
              </td>
              {showProject ? (
                <td>
                  <div className="cell-text !max-w-[16rem]">
                    <Link to={`/projects/${finding.project_id}`} className="text-ink-soft hover:underline">
                      {projectName(finding.project_id)}
                    </Link>
                  </div>
                </td>
              ) : null}
              <td>
                <StatusBadge status={finding.status} />
              </td>
              {showTracking ? (
                <>
                  <td>
                    <VerificationBadge status={finding.verification_status} />
                  </td>
                  <td>
                    <ReportBadge status={finding.report_status} />
                  </td>
                </>
              ) : null}
              <td className="whitespace-nowrap tabular-nums text-ink-soft">{formatDate(finding.updated_at)}</td>
              <td className="text-right">
                <FindingRowActions finding={finding} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
