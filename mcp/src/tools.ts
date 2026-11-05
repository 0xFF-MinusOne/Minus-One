import { fetchAllPages } from '../../src/api/pagination';
import {
  FINDING_LIST_COLUMNS,
  type Finding,
  type FindingInsert,
  type FindingListItem,
  type Project,
  type ProjectInsert,
} from '../../src/lib/domain';
import { filterFindings, sortFindings } from '../../src/lib/filter';
import { computeMetrics, projectProgress, severityBreakdown } from '../../src/lib/stats';
import { parseTrivyJson, TrivyParseError, type TrivyImportItem } from '../../src/lib/trivy';
import { safeHttpUrl } from '../../src/lib/url';
import type { Json } from '../../src/lib/database.types';
import type { DbClient } from './auth';
import { checkFindingGuard, truncateGuardedText, type GuardFields } from './guard';
import { readImportFile } from './importPath';
import { ToolInputError } from './response';
import type { CreateFindingInput, CreateProjectInput, UpdateFindingInput } from './schemas';

/** 一覧の 1 文字列の上限。全文は get_finding で読む。 */
export const LIST_STRING_LIMIT = 500;

function requirePresent<T>(row: T | null, what: string): T {
  if (!row) throw new ToolInputError(`${what}が見つかりません。`);
  return row;
}

function nullIfBlank<T>(value: T): T | null {
  return typeof value === 'string' && value.trim() === '' ? null : value;
}

/** undefined は「変更しない」のまま残し、空文字は NULL にする。 */
function normalize<T extends Record<string, unknown>>(input: T): T {
  return Object.fromEntries(
    Object.entries(input)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, nullIfBlank(value)]),
  ) as T;
}

function checkReportUrl(url: string | null | undefined): void {
  if (url && !safeHttpUrl(url)) throw new ToolInputError('report_url は http または https の URL にしてください。');
}

function assertSomeChange(values: Record<string, unknown>): void {
  if (Object.keys(values).length === 0) throw new ToolInputError('更新する項目を指定してください。');
}

export function createTools(db: DbClient, importDir: string | null) {
  const allFindings = (projectId?: string) =>
    fetchAllPages<FindingListItem>((from, to) => {
      const query = db.from('findings').select(FINDING_LIST_COLUMNS);
      return (projectId ? query.eq('project_id', projectId) : query).order('seq', { ascending: false }).range(from, to);
    });

  const findRow = async (ref: string): Promise<Finding | null> => {
    const column = ref.startsWith('PEN-') ? 'ref_id' : 'id';
    const { data, error } = await db.from('findings').select('*').eq(column, ref).maybeSingle();
    if (error) throw error;
    return data;
  };

  return {
    async listProjects(input: { status?: Project['status']; limit: number; offset: number }) {
      const base = db.from('projects').select('*', { count: 'exact' });
      const { data, error, count } = await (input.status ? base.eq('status', input.status) : base)
        .order('updated_at', { ascending: false })
        .order('id')
        .range(input.offset, input.offset + input.limit - 1);
      if (error) throw error;
      const rows = data ?? [];
      return { items: rows, total: count ?? rows.length, has_more: input.offset + rows.length < (count ?? 0) };
    },

    async getProject({ id }: { id: string }) {
      const { data, error } = await db.from('projects').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      const project = requirePresent(data, 'プロジェクト');
      return { project, progress: projectProgress(project, await allFindings(id)) };
    },

    async createProject(input: CreateProjectInput) {
      const { data, error } = await db.from('projects').insert(normalize(input) as ProjectInsert).select().single();
      if (error) throw error;
      return data;
    },

    async updateProject({ id, ...input }: Partial<CreateProjectInput> & { id: string }) {
      const values = normalize(input);
      assertSomeChange(values);
      const { data, error } = await db.from('projects').update(values as ProjectInsert).eq('id', id).select().maybeSingle();
      if (error) throw error;
      return requirePresent(data, 'プロジェクト');
    },

    async listFindings(input: {
      project_id?: string;
      severity?: Finding['severity'];
      status?: Finding['status'];
      verification_status?: Finding['verification_status'];
      report_status?: Finding['report_status'];
      query?: string;
      limit: number;
      offset: number;
    }) {
      const filtered = filterFindings(await allFindings(input.project_id), {
        projectId: input.project_id,
        severity: input.severity,
        status: input.status,
        verification: input.verification_status,
        report: input.report_status,
        query: input.query,
      });
      const sorted = sortFindings(filtered, { key: 'updated_at', direction: 'desc' });
      const items = sorted.slice(input.offset, input.offset + input.limit);
      return { items, total: sorted.length, has_more: input.offset + items.length < sorted.length };
    },

    async getFinding({ id }: { id: string }) {
      return requirePresent(await findRow(id), '検出事項');
    },

    async createFinding(input: CreateFindingInput) {
      const values = normalize(input);
      checkReportUrl(values.report_url);
      checkFindingGuard(values as Partial<GuardFields>);
      const { data, error } = await db.from('findings').insert(values as FindingInsert).select().single();
      if (error) throw error;
      return data;
    },

    async updateFinding({ id, ...input }: UpdateFindingInput) {
      const values = normalize(input);
      assertSomeChange(values);
      checkReportUrl(values.report_url);
      const current = requirePresent(await findRow(id), '検出事項');
      checkFindingGuard(values as Partial<GuardFields>, current);
      // 確認の後で報告状況が変わっていたら更新しない（判定のすり抜けを防ぐ）。
      const { data, error } = await db
        .from('findings')
        .update(values as FindingInsert)
        .eq('id', current.id)
        .eq('report_status', current.report_status)
        .select()
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new ToolInputError('更新できませんでした。同時に変更された可能性があります。読み直してください。');
      return data;
    },

    async importTrivyFile({ project_id, path }: { project_id: string; path: string }) {
      const json = await readImportFile(path, importDir);
      let parsed;
      try {
        parsed = parseTrivyJson(json);
      } catch (error) {
        if (error instanceof TrivyParseError) throw new ToolInputError(error.message);
        throw error;
      }
      // 取り込みは未報告で入る。人が読む上限に合わせて本文を切る。
      let truncated = 0;
      const items: TrivyImportItem[] = parsed.items.map((item) => {
        const description = truncateGuardedText(item.description);
        const remediation = truncateGuardedText(item.remediation);
        truncated += Number(description.truncated) + Number(remediation.truncated);
        return { ...item, description: description.value, remediation: remediation.value };
      });
      const { data, error } = await db.rpc('import_trivy_findings', {
        p_project_id: project_id,
        p_items: items as unknown as Json,
      });
      if (error) throw error;
      const outcome = data?.[0];
      if (!outcome) throw new ToolInputError('取り込みの結果を受け取れませんでした。');
      return { ...outcome, truncated_texts: truncated, summary: parsed.summary };
    },

    async getSummary({ project_id }: { project_id?: string }) {
      const projects = await fetchAllPages<Project>((from, to) => {
        const query = db.from('projects').select('*');
        return (project_id ? query.eq('id', project_id) : query).order('id').range(from, to);
      });
      if (project_id && projects.length === 0) throw new ToolInputError('プロジェクトが見つかりません。');
      const findings = await allFindings(project_id);
      return {
        metrics: computeMetrics(projects, findings),
        severity_breakdown: severityBreakdown(findings),
        project_count: projects.length,
      };
    },
  };
}
