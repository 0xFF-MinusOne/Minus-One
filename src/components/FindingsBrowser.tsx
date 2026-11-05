import { Plus, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  FINDING_STATUSES,
  FINDING_STATUS_LABELS,
  REPORT_STATUSES,
  REPORT_STATUS_LABELS,
  SEVERITIES,
  SEVERITY_LABELS,
  VERIFICATION_LABELS,
  VERIFICATION_STATUSES,
  type FindingListItem,
  type FindingStatus,
  type Project,
  type ReportStatus,
  type Severity,
  type VerificationStatus,
} from '../lib/domain';
import { filterFindings, sortFindings, type FindingSortKey } from '../lib/filter';
import { FindingFormDialog } from './FindingForm';
import { FindingsTable } from './FindingsTable';
import { Button, EmptyState, Pagination, useSort } from './ui';

const PAGE_SIZE = 50;

function oneOf<T extends string>(list: readonly T[], value: string | null): T | null {
  return list.includes(value as T) ? (value as T) : null;
}

/** 絞り込みと並べ替えつきの一覧。絞り込みは URL に持ち、再読み込みしても残る。 */
export function FindingsBrowser({
  findings,
  projects,
  fixedProjectId,
}: {
  findings: readonly FindingListItem[];
  projects: readonly Project[];
  fixedProjectId?: string;
}) {
  const [params, setParams] = useSearchParams();
  const [sort, toggleSort] = useSort<FindingSortKey>({ key: 'updated_at', direction: 'desc' });
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);

  const severity = oneOf<Severity>(SEVERITIES, params.get('severity'));
  const status = oneOf<FindingStatus>(FINDING_STATUSES, params.get('status'));
  const verification = oneOf<VerificationStatus>(VERIFICATION_STATUSES, params.get('verification'));
  const report = oneOf<ReportStatus>(REPORT_STATUSES, params.get('report'));
  const projectId = fixedProjectId ?? params.get('project');
  const query = params.get('q') ?? '';

  const setParam = useCallback(
    (key: string, value: string) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (value) next.set(key, value);
          else next.delete(key);
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const projectNames = useMemo(() => new Map(projects.map((project) => [project.id, project.name])), [projects]);
  const projectName = useCallback((id: string) => projectNames.get(id) ?? '—', [projectNames]);

  const filtered = useMemo(
    () => filterFindings(findings, { projectId, severity, status, verification, report, query }),
    [findings, projectId, severity, status, verification, report, query],
  );

  useEffect(() => setPage(1), [projectId, severity, status, verification, report, query, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = useMemo(
    () =>
      sortFindings(filtered, sort, projectName).slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filtered, sort, projectName, currentPage],
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-ink-muted" aria-hidden />
          <input
            type="search"
            aria-label="文字列で検索"
            placeholder="タイトル、ID、CVE、箇所で検索"
            className="field-control !pl-8"
            value={query}
            onChange={(event) => setParam('q', event.target.value)}
          />
        </div>
        {fixedProjectId ? null : (
          <FilterSelect
            label="プロジェクト"
            value={projectId ?? ''}
            onChange={(value) => setParam('project', value)}
            options={projects.map((project) => [project.id, project.name])}
          />
        )}
        <FilterSelect
          label="深刻度"
          value={severity ?? ''}
          onChange={(value) => setParam('severity', value)}
          options={SEVERITIES.map((value) => [value, SEVERITY_LABELS[value]])}
        />
        <FilterSelect
          label="ステータス"
          value={status ?? ''}
          onChange={(value) => setParam('status', value)}
          options={FINDING_STATUSES.map((value) => [value, FINDING_STATUS_LABELS[value]])}
        />
        <FilterSelect
          label="検証状況"
          value={verification ?? ''}
          onChange={(value) => setParam('verification', value)}
          options={VERIFICATION_STATUSES.map((value) => [value, VERIFICATION_LABELS[value]])}
        />
        <FilterSelect
          label="報告状況"
          value={report ?? ''}
          onChange={(value) => setParam('report', value)}
          options={REPORT_STATUSES.map((value) => [value, REPORT_STATUS_LABELS[value]])}
        />
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          検出事項を追加
        </Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title={findings.length === 0 ? '検出事項はまだありません。' : '条件に合う検出事項はありません。'} />
      ) : (
        <>
          <FindingsTable
            findings={visible}
            projectName={projectName}
            sort={sort}
            onSort={toggleSort}
            showProject={!fixedProjectId}
          />
          <Pagination page={currentPage} pageCount={pageCount} total={filtered.length} onPage={setPage} />
        </>
      )}

      {creating ? (
        <FindingFormDialog defaultProjectId={fixedProjectId} onClose={() => setCreating(false)} />
      ) : null}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<readonly [string, string]>;
}) {
  return (
    <label className="block">
      <span className="mb-1 block whitespace-nowrap text-xs font-semibold text-ink-soft">{label}</span>
      <select className="field-control !w-auto max-w-44" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">すべて</option>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}
