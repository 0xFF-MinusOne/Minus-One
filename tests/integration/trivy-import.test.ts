import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Json } from '../../src/lib/database.types';
import { parseTrivyJson, type TrivyImportItem } from '../../src/lib/trivy';
import { admin, cleanup, createTempUser, currentCounter, rememberCounter, type TempUser } from './helpers';

const fixture = (name: string) =>
  parseTrivyJson(readFileSync(new URL(`../../src/test/fixtures/${name}`, import.meta.url), 'utf8'));

let user: TempUser;
let projectId: string;
let counterStart: number;

async function runImport(items: readonly TrivyImportItem[], project = projectId) {
  const { data, error } = await user.client.rpc('import_trivy_findings', {
    p_project_id: project,
    p_items: items as unknown as Json,
  });
  if (error) throw error;
  return data?.[0];
}

async function rows() {
  const { data, error } = await user.client.from('findings').select('*').eq('project_id', projectId).order('seq');
  if (error) throw error;
  return data;
}

beforeAll(async () => {
  rememberCounter();
  counterStart = currentCounter();
  user = await createTempUser('import', 'member');
  const { data, error } = await user.client.from('projects').insert({ name: '取り込みの確認' }).select().single();
  if (error) throw error;
  projectId = data.id;
});

afterAll(cleanup);

describe('Trivy 取り込み（パーサーと DB）', () => {
  it('初回はすべて新規になる', async () => {
    const parsed = fixture('trivy-sample.json');
    expect(parsed.items).toHaveLength(6);
    expect(await runImport(parsed.items)).toEqual({ inserted: 6, updated: 0, skipped: 0 });

    const stored = await rows();
    expect(stored).toHaveLength(6);
    expect(stored.every((row) => row.source === 'trivy')).toBe(true);
    expect(stored.map((row) => row.seq)).toEqual([1, 2, 3, 4, 5, 6].map((n) => counterStart + n));
    expect(stored.every((row) => row.status === 'open')).toBe(true);
  });

  it('同じファイルの再取り込みはすべてスキップになり、採番を消費しない', async () => {
    const result = await runImport(fixture('trivy-sample.json').items);
    expect(result).toEqual({ inserted: 0, updated: 0, skipped: 6 });
    expect(currentCounter()).toBe(counterStart + 6);
    expect((await admin.from('findings').select('id').eq('project_id', projectId)).data).toHaveLength(6);
  });

  it('再取り込みはスキャン由来の項目を更新し、人の変更を残す', async () => {
    const before = (await rows()).find((row) => row.source_rule_id === 'CVE-2099-0001' && row.source_package === 'acme-http');
    if (!before) throw new Error('対象がありません');

    const edit = await user.client
      .from('findings')
      .update({
        status: 'in_progress',
        verification_status: 'reproduced',
        report_status: 'reported',
        report_url: 'https://example.test/report/1',
        reported_on: '2026-10-30',
        reproduction_steps: '人が書いた再現手順',
        local_reference: 'notes/pen-1.md',
      })
      .eq('id', before.id);
    expect(edit.error).toBeNull();

    const result = await runImport(fixture('trivy-rescan.json').items);
    expect(result).toEqual({ inserted: 1, updated: 1, skipped: 0 });

    const after = (await rows()).find((row) => row.id === before.id);
    expect(after).toMatchObject({
      ref_id: before.ref_id,
      title: 'CVE-2099-0001: acme-http: 架空のリクエスト偽装（内容を更新）',
      severity: 'high',
      cvss_score: 7.3,
      remediation: 'acme-http を 1.2.5 以上に更新する。',
      status: 'in_progress',
      verification_status: 'reproduced',
      report_status: 'reported',
      report_url: 'https://example.test/report/1',
      reported_on: '2026-10-30',
      reproduction_steps: '人が書いた再現手順',
      local_reference: 'notes/pen-1.md',
    });
    expect((await rows()).length).toBe(7);
  });

  it('再取り込みの欠落項目は既存の値を消さない', async () => {
    const item = fixture('trivy-rescan.json').items[0];
    if (!item) throw new Error('項目がありません');
    const result = await runImport([{ ...item, description: null, cwe: null, remediation: null, cvss_score: null, cvss_vector: null }]);
    expect(result).toEqual({ inserted: 0, updated: 0, skipped: 1 });
    const row = (await rows()).find((r) => r.source_rule_id === item.source_rule_id && r.source_package === item.source_package);
    expect(row?.remediation).toBe('acme-http を 1.2.5 以上に更新する。');
    expect(row?.cvss_score).toBe(7.3);
  });

  it('別のプロジェクトなら同じ項目も別に登録する', async () => {
    const other = await user.client.from('projects').insert({ name: '別の案件' }).select().single();
    if (other.error) throw other.error;
    const result = await runImport(fixture('trivy-rescan.json').items, other.data.id);
    expect(result).toEqual({ inserted: 2, updated: 0, skipped: 0 });
  });

  it('不正な項目が 1 件でもあれば全体を取り消す', async () => {
    const before = (await rows()).length;
    const good: TrivyImportItem = {
      title: '正しい項目',
      severity: 'low',
      cve: null,
      cwe: null,
      cvss_score: null,
      cvss_vector: null,
      affected_location: null,
      description: null,
      remediation: null,
      source_target: 'rollback.json',
      source_rule_id: 'R-1',
      source_package: '',
    };
    const { error } = await user.client.rpc('import_trivy_findings', {
      p_project_id: projectId,
      p_items: [good, { ...good, source_rule_id: 'R-2', severity: 'bogus' }] as unknown as Json,
    });
    expect(error).not.toBeNull();
    expect((await rows()).length).toBe(before);
  });

  it('Results が null のファイルは 0 件で正常に終わる', async () => {
    const parsed = fixture('trivy-null-results.json');
    expect(await runImport(parsed.items)).toEqual({ inserted: 0, updated: 0, skipped: 0 });
  });

  it('大量の項目を一括で登録し、再取り込みも時間内に終わる', async () => {
    const big = await user.client.from('projects').insert({ name: '大量データ' }).select().single();
    if (big.error) throw big.error;
    const items: TrivyImportItem[] = Array.from({ length: 8000 }, (_, index) => ({
      title: `CVE-2099-${index}: 架空の大量データ`,
      severity: 'medium',
      cve: null,
      cwe: null,
      cvss_score: 5,
      cvss_vector: null,
      affected_location: 'package-lock.json',
      description: '説明'.repeat(500),
      remediation: null,
      source_target: 'package-lock.json',
      source_rule_id: `CVE-2099-${index}`,
      source_package: `pkg-${index}`,
    }));
    const startedAt = Date.now();
    expect(await runImport(items, big.data.id)).toEqual({ inserted: 8000, updated: 0, skipped: 0 });
    const insertedAt = Date.now();
    expect(await runImport(items, big.data.id)).toEqual({ inserted: 0, updated: 0, skipped: 8000 });
    console.log(`8000 件: 新規 ${insertedAt - startedAt}ms、再取り込み ${Date.now() - insertedAt}ms`);
  });
});
