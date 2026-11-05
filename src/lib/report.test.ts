import { describe, expect, it } from 'vitest';
import { makeFinding, makeProject } from '../test/factories';
import { buildProjectReport, reportFileName } from './report';

const NOW = new Date(2026, 10, 4, 12);

describe('buildProjectReport', () => {
  it('概要、深刻度別の件数、詳細を含む', () => {
    const report = buildProjectReport(
      makeProject({ name: '架空の診断', notes: 'メモです' }),
      [
        makeFinding({ seq: 2, severity: 'low', title: '低い指摘' }),
        makeFinding({
          seq: 1,
          severity: 'critical',
          title: '緊急の指摘',
          description: '説明です',
          reproduction_steps: '手順です',
          impact: '影響です',
          remediation: '修正案です',
          cve: 'CVE-2099-0001',
          cvss_score: 9.8,
          report_url: 'https://example.test/report',
        }),
      ],
      NOW,
    );
    expect(report).toContain('# 架空の診断 報告書');
    expect(report).toContain('## 概要');
    expect(report).toContain('- **種別:** 顧客案件');
    expect(report).toContain('| 緊急 | 1 |');
    expect(report).toContain('| 低 | 1 |');
    expect(report).toContain('| 合計 | 2 |');
    expect(report).toContain('### PEN-0001 緊急の指摘');
    expect(report).toContain('#### 再現手順');
    expect(report).toContain('<https://example.test/report>');
    expect(report).toContain('- **CVSS:** 9.8');
    // 深刻度の高い順に並ぶ。
    expect(report.indexOf('PEN-0001')).toBeLessThan(report.indexOf('PEN-0002'));
    expect(report).toContain('メモです');
  });

  it('誤検知を件数と詳細から除き、除外数を記す', () => {
    const report = buildProjectReport(
      makeProject(),
      [makeFinding({ seq: 1 }), makeFinding({ seq: 2, status: 'false_positive', title: '誤検知の指摘' })],
      NOW,
    );
    expect(report).toContain('| 合計 | 1 |');
    expect(report).toContain('誤検知 1 件');
    expect(report).not.toContain('誤検知の指摘');
  });

  it('検出事項が無くても出力できる', () => {
    expect(buildProjectReport(makeProject(), [], NOW)).toContain('検出事項はありません。');
  });

  it('取り込みデータの Markdown や HTML を無効にする', () => {
    const report = buildProjectReport(
      makeProject({ name: '<script>alert(1)</script>' }),
      [
        makeFinding({
          title: '![x](https://evil.test/a.png) [click](https://evil.test)',
          description: '<img src=x onerror=alert(1)>\n# 見出しの偽装\n![t](https://evil.test/t.png)',
        }),
      ],
      NOW,
    );
    expect(report).not.toMatch(/<script>|<img/);
    expect(report).not.toContain('![');
    expect(report).not.toContain('](https://evil.test');
    expect(report).not.toMatch(/^# 見出しの偽装/m);
  });

  it('http/https 以外の報告先はリンクにしない', () => {
    const report = buildProjectReport(makeProject(), [makeFinding({ report_url: 'javascript:alert(1)' })], NOW);
    expect(report).not.toContain('javascript:');
  });
});

describe('手元メモの参照', () => {
  it('再現手順が空なら「手元メモ参照」と参照先を示す', () => {
    const report = buildProjectReport(
      makeProject(),
      [makeFinding({ reproduction_steps: '  ', local_reference: 'notes/pen-1.md' })],
      NOW,
    );
    expect(report).toContain('手元メモ参照（` notes/pen-1.md `）');
  });

  it('参照先が無くても「手元メモ参照」を示す', () => {
    expect(buildProjectReport(makeProject(), [makeFinding()], NOW)).toContain('手元メモ参照\n');
  });

  it('再現手順があれば本文を出し、参照先はリンクにしない', () => {
    const report = buildProjectReport(
      makeProject(),
      [makeFinding({ reproduction_steps: '手順です', local_reference: '[x](https://evil.test)' })],
      NOW,
    );
    expect(report).toContain('手順です');
    expect(report).not.toContain('手元メモ参照');
    expect(report).toContain('手元メモ: ` [x](https://evil.test) `');
  });
});

describe('reportFileName', () => {
  it('ファイル名に使えない文字を置き換える', () => {
    expect(reportFileName({ name: '../a/b:c d' }, NOW)).toMatch(/^report-[^/\\:]+-2026-11-04\.md$/);
  });
});
