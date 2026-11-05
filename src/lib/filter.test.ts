import { describe, expect, it } from 'vitest';
import { makeListItem } from '../test/factories';
import { filterFindings, matchesQuery, sortFindings } from './filter';

const items = [
  makeListItem({ seq: 1, severity: 'low', title: 'SQL インジェクション', status: 'open', updated_at: '2026-10-01' }),
  makeListItem({ seq: 2, severity: 'critical', title: '認証の欠如', status: 'resolved', updated_at: '2026-10-03', cve: 'CVE-2099-0001' }),
  makeListItem({ seq: 3, severity: 'high', title: 'XSS', project_id: 'p2', verification_status: 'reproduced', report_status: 'reported', updated_at: '2026-10-02' }),
];

describe('filterFindings', () => {
  it('各条件で絞り込む', () => {
    expect(filterFindings(items, { severity: 'critical' }).map((i) => i.seq)).toEqual([2]);
    expect(filterFindings(items, { status: 'resolved' }).map((i) => i.seq)).toEqual([2]);
    expect(filterFindings(items, { projectId: 'p2' }).map((i) => i.seq)).toEqual([3]);
    expect(filterFindings(items, { verification: 'reproduced' }).map((i) => i.seq)).toEqual([3]);
    expect(filterFindings(items, { report: 'reported' }).map((i) => i.seq)).toEqual([3]);
  });

  it('文字列検索は ID と CVE も対象で、大文字小文字と全角半角を区別しない', () => {
    expect(filterFindings(items, { query: 'pen-0003' }).map((i) => i.seq)).toEqual([3]);
    expect(filterFindings(items, { query: 'cve-2099' }).map((i) => i.seq)).toEqual([2]);
    expect(matchesQuery('ＳＱＬ', ['sql'])).toBe(true);
    expect(matchesQuery('sql 認証', ['SQL'])).toBe(false);
  });
});

describe('sortFindings', () => {
  it('深刻度は緊急→情報の順', () => {
    const asc = sortFindings(items, { key: 'severity', direction: 'asc' });
    expect(asc.map((i) => i.severity)).toEqual(['critical', 'high', 'low']);
  });

  it('更新日の新しい順', () => {
    const sorted = sortFindings(items, { key: 'updated_at', direction: 'desc' });
    expect(sorted.map((i) => i.seq)).toEqual([2, 3, 1]);
  });

  it('元の配列を変えない', () => {
    const before = items.map((i) => i.seq);
    sortFindings(items, { key: 'ref_id', direction: 'desc' });
    expect(items.map((i) => i.seq)).toEqual(before);
  });
});
