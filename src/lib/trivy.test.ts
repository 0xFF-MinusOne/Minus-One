import { describe, expect, it } from 'vitest';
import nullResults from '../test/fixtures/trivy-null-results.json';
import sample from '../test/fixtures/trivy-sample.json';
import {
  MAX_TRIVY_FILE_BYTES,
  parseTrivyJson,
  parseTrivyReport,
  readTrivyFile,
  trivyItemKey,
  TrivyParseError,
} from './trivy';

function find(items: ReturnType<typeof parseTrivyReport>['items'], rule: string, pkg = '') {
  const item = items.find((entry) => entry.source_rule_id === rule && entry.source_package === pkg);
  if (!item) throw new Error(`見つかりません: ${rule} ${pkg}`);
  return item;
}

describe('parseTrivyReport', () => {
  const { items, summary } = parseTrivyReport(sample);

  it('脆弱性と FAIL の設定不備だけを検出事項にする', () => {
    expect(summary.vulnerabilities).toBe(3);
    expect(summary.misconfigurations).toBe(3);
    expect(items).toHaveLength(6);
  });

  it('FAIL 以外を除外して数える', () => {
    expect(summary.excludedNonFail).toBe(2);
    expect(items.some((item) => item.source_rule_id === 'AVD-EXAMPLE-0004')).toBe(false);
    expect(items.some((item) => item.source_rule_id === 'AVD-EXAMPLE-0005')).toBe(false);
  });

  it('対象ファイル + ID + パッケージ名 で重複をまとめる', () => {
    expect(summary.duplicates).toBe(2);
    expect(items.filter((item) => item.source_rule_id === 'CVE-2099-0001')).toHaveLength(2);
    const keys = items.map(trivyItemKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('同じ指摘の別の行は位置として残す', () => {
    expect(find(items, 'AVD-EXAMPLE-0001').affected_location).toBe('deploy/main.tf:10-12, deploy/main.tf:40');
  });

  it('CauseMetadata.Code や CauseMetadata が無くても落ちない', () => {
    expect(find(items, 'AVD-EXAMPLE-0002').description).toBeNull();
    expect(find(items, 'AVD-EXAMPLE-0002').affected_location).toBe('deploy/main.tf');
    expect(find(items, 'AVD-EXAMPLE-0003').severity).toBe('low');
  });

  it('CauseMetadata.Code の本文は保存しない', () => {
    expect(JSON.stringify(items)).not.toContain('public = true');
  });

  it('ID の無い項目は数えて飛ばす', () => {
    expect(summary.invalid).toBe(2);
  });

  it('深刻度の配点元（SeveritySource）の CVSS を優先する', () => {
    const item = find(items, 'CVE-2099-0001', 'acme-http');
    expect(item.severity).toBe('critical');
    expect(item.cve).toBe('CVE-2099-0001');
    expect(item.cwe).toBe('CWE-444');
    expect(item.cvss_score).toBe(9.8);
    expect(item.remediation).toBe('acme-http を 1.2.4 以上に更新する。');
  });

  it('CVE 以外の ID は cve に入れず、UNKNOWN は情報にする', () => {
    const item = find(items, 'GHSA-aaaa-bbbb-cccc', 'acme-ui');
    expect(item.cve).toBeNull();
    expect(item.severity).toBe('info');
  });

  it('シークレットは取り込まず、値も保持しない', () => {
    expect(summary.secretsIgnored).toBe(1);
    expect(JSON.stringify(items)).not.toContain('EXAMPLE_KEY');
  });

  it('Results が null、欠落、配列以外でも空の結果を返す', () => {
    expect(parseTrivyReport(nullResults).items).toEqual([]);
    expect(parseTrivyReport({}).items).toEqual([]);
    expect(parseTrivyReport({ Results: 'x' }).items).toEqual([]);
    expect(parseTrivyReport({ Results: [null, 1, { Vulnerabilities: 'x' }] }).items).toEqual([]);
  });

  it('型の違う値を欠落として扱う', () => {
    const { items: odd, summary: oddSummary } = parseTrivyReport({
      Results: [
        {
          Vulnerabilities: [
            1,
            null,
            {
              VulnerabilityID: 'CVE-2099-0100',
              Title: { nested: true },
              PkgName: ['x'],
              Severity: 7,
              CweIDs: 'CWE-1',
              References: 'https://example.test',
              CVSS: { nvd: { V3Score: 99, V3Vector: 3 } },
            },
          ],
        },
      ],
    });
    expect(oddSummary.invalid).toBe(2);
    expect(odd[0]).toMatchObject({
      source_target: '(対象不明)',
      source_package: '',
      severity: 'info',
      cwe: null,
      cvss_score: null,
    });
  });

  it('Postgres が受け取れない文字を取り除く', () => {
    const { items: cleaned } = parseTrivyReport({
      Results: [
        {
          Target: 'a\u0000b',
          Vulnerabilities: [{ VulnerabilityID: 'CVE-2099-0200', Title: 'x\ud800y', Description: 'd\u0000e' }],
        },
      ],
    });
    expect(cleaned[0]?.source_target).toBe('ab');
    expect(cleaned[0]?.title).toBe('CVE-2099-0200: x�y');
    expect(cleaned[0]?.description).toBe('de');
  });

  it('最上位がオブジェクトでなければエラーにする', () => {
    expect(() => parseTrivyReport([])).toThrow(TrivyParseError);
    expect(() => parseTrivyReport(null)).toThrow(TrivyParseError);
  });
});

describe('parseTrivyJson / readTrivyFile', () => {
  it('不正な JSON は日本語のエラーにする', () => {
    expect(() => parseTrivyJson('{ broken')).toThrow(/JSON として読み取れません/);
  });

  it('BOM つきでも読める', () => {
    expect(parseTrivyJson('﻿{"Results":null}').items).toEqual([]);
  });

  it('上限を超えるファイルは中身を読まずに断る', async () => {
    let read = false;
    const file = {
      size: MAX_TRIVY_FILE_BYTES + 1,
      text: async () => {
        read = true;
        return '{}';
      },
    };
    await expect(readTrivyFile(file)).rejects.toThrow(/大きすぎます/);
    expect(read).toBe(false);
  });
});
