import type { Json } from '../lib/database.types';
import { FINDING_LIST_COLUMNS, type Finding, type FindingInsert, type FindingListItem } from '../lib/domain';
import { supabase } from '../lib/supabase';
import { trivyItemKey, type TrivyImportItem } from '../lib/trivy';
import { fetchAllPages } from './pagination';

export function listFindings(): Promise<FindingListItem[]> {
  return fetchAllPages<FindingListItem>((from, to) =>
    supabase.from('findings').select(FINDING_LIST_COLUMNS).order('seq', { ascending: false }).range(from, to),
  );
}

export function listProjectFindingsFull(projectId: string): Promise<Finding[]> {
  return fetchAllPages<Finding>((from, to) =>
    supabase.from('findings').select('*').eq('project_id', projectId).order('seq').range(from, to),
  );
}

export async function getFinding(id: string): Promise<Finding | null> {
  const { data, error } = await supabase.from('findings').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function createFinding(values: FindingInsert): Promise<Finding> {
  const { data, error } = await supabase.from('findings').insert(values).select().single();
  if (error) throw error;
  return data;
}

export async function updateFinding(id: string, values: FindingInsert): Promise<Finding> {
  const { data, error } = await supabase.from('findings').update(values).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteFinding(id: string): Promise<void> {
  const { error } = await supabase.from('findings').delete().eq('id', id);
  if (error) throw error;
}

/** 確認画面の見込み件数用に、プロジェクト内の取り込み済みキーを読む。 */
export async function listTrivyKeys(projectId: string): Promise<Set<string>> {
  const rows = await fetchAllPages<{
    source_target: string | null;
    source_rule_id: string | null;
    source_package: string | null;
  }>((from, to) =>
    supabase
      .from('findings')
      .select('source_target,source_rule_id,source_package')
      .eq('project_id', projectId)
      .eq('source', 'trivy')
      .order('seq')
      .range(from, to),
  );
  return new Set(
    rows.map((row) =>
      trivyItemKey({
        source_target: row.source_target ?? '',
        source_rule_id: row.source_rule_id ?? '',
        source_package: row.source_package ?? '',
      }),
    ),
  );
}

export interface ImportOutcome {
  inserted: number;
  updated: number;
  skipped: number;
}

/** 1 トランザクションで一括登録する。途中で失敗すれば何も保存されない。 */
export async function importTrivyItems(
  projectId: string,
  items: readonly TrivyImportItem[],
): Promise<ImportOutcome> {
  const { data, error } = await supabase.rpc('import_trivy_findings', {
    p_project_id: projectId,
    p_items: items as unknown as Json,
  });
  if (error) throw error;
  const row = data?.[0];
  if (!row) throw new Error('取り込みの結果を受け取れませんでした。');
  return row;
}
