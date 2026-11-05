import { describe, expect, it } from 'vitest';
import { makeFinding, makeProject } from '../test/factories';
import { computeMetrics, groupByProject, projectProgress, severityBreakdown, startOfWeek, totalOf } from './stats';

// 2026-11-04 は水曜。今週は 11/02（月）から。
const NOW = new Date(2026, 10, 4, 12, 0, 0);
const THIS_WEEK = new Date(2026, 10, 2, 0, 0, 0).toISOString();
const LAST_WEEK = new Date(2026, 10, 1, 23, 59, 59).toISOString();

describe('startOfWeek', () => {
  it('週の始まりは月曜 0 時', () => {
    expect(startOfWeek(NOW)).toEqual(new Date(2026, 10, 2));
    expect(startOfWeek(new Date(2026, 10, 8, 23))).toEqual(new Date(2026, 10, 2));
    expect(startOfWeek(new Date(2026, 10, 2, 0, 0, 1))).toEqual(new Date(2026, 10, 2));
  });
});

describe('computeMetrics', () => {
  it('実データから値と今週の増分を計算する', () => {
    const metrics = computeMetrics(
      [
        makeProject({ id: 'a', status: 'active', created_at: THIS_WEEK }),
        makeProject({ id: 'b', status: 'active', created_at: LAST_WEEK }),
        makeProject({ id: 'c', status: 'completed', created_at: THIS_WEEK }),
      ],
      [
        makeFinding({ seq: 1, severity: 'critical', created_at: THIS_WEEK }),
        makeFinding({ seq: 2, severity: 'critical', status: 'resolved', created_at: LAST_WEEK, resolved_at: THIS_WEEK }),
        makeFinding({ seq: 3, severity: 'low', status: 'resolved', created_at: LAST_WEEK, resolved_at: LAST_WEEK }),
        makeFinding({ seq: 4, severity: 'high', created_at: LAST_WEEK }),
      ],
      NOW,
    );
    expect(metrics.activeProjects).toEqual({ value: 2, thisWeek: 1 });
    expect(metrics.totalFindings).toEqual({ value: 4, thisWeek: 1 });
    expect(metrics.criticalFindings).toEqual({ value: 2, thisWeek: 1, unresolved: 1 });
    expect(metrics.resolvedFindings).toEqual({ value: 2, thisWeek: 1 });
  });

  it('誤検知はすべての集計から除く', () => {
    const metrics = computeMetrics(
      [],
      [makeFinding({ severity: 'critical', status: 'false_positive', created_at: THIS_WEEK })],
      NOW,
    );
    expect(metrics.totalFindings).toEqual({ value: 0, thisWeek: 0 });
    expect(metrics.criticalFindings).toEqual({ value: 0, thisWeek: 0, unresolved: 0 });
  });

  it('データが無くても 0 を返す', () => {
    const metrics = computeMetrics([], [], NOW);
    expect(metrics.activeProjects.value).toBe(0);
    expect(metrics.resolvedFindings.thisWeek).toBe(0);
  });
});

describe('severityBreakdown', () => {
  it('深刻度ごとに数え、誤検知を除く', () => {
    const counts = severityBreakdown([
      makeFinding({ severity: 'critical' }),
      makeFinding({ severity: 'info' }),
      makeFinding({ severity: 'info' }),
      makeFinding({ severity: 'high', status: 'false_positive' }),
    ]);
    expect(counts).toEqual({ critical: 1, high: 0, medium: 0, low: 0, info: 2 });
    expect(totalOf(counts)).toBe(3);
  });
});

describe('projectProgress', () => {
  const project = makeProject({ updated_at: '2026-10-01T00:00:00Z' });

  it('解決済みとリスク受容を進捗に数え、誤検知は母数から除く', () => {
    const progress = projectProgress(project, [
      makeFinding({ status: 'resolved' }),
      makeFinding({ status: 'risk_accepted' }),
      makeFinding({ status: 'open' }),
      makeFinding({ status: 'in_progress' }),
      makeFinding({ status: 'false_positive' }),
    ]);
    expect(progress.findingCount).toBe(4);
    expect(progress.allFindingCount).toBe(5);
    expect(progress.percent).toBe(50);
  });

  it('すべて終わるまで 100% にしない', () => {
    const findings = [
      ...Array.from({ length: 199 }, () => makeFinding({ status: 'resolved' })),
      makeFinding({ status: 'open' }),
    ];
    expect(projectProgress(project, findings).percent).toBe(99);
  });

  it('検出事項が無ければ進捗は null', () => {
    expect(projectProgress(project, []).percent).toBeNull();
  });

  it('更新日は検出事項の更新も含めた最新', () => {
    const progress = projectProgress(project, [makeFinding({ updated_at: '2026-10-20T00:00:00Z' })]);
    expect(progress.lastUpdatedAt).toBe('2026-10-20T00:00:00Z');
  });
});

describe('groupByProject', () => {
  it('プロジェクトごとにまとめる', () => {
    const groups = groupByProject([makeFinding({ project_id: 'a' }), makeFinding({ project_id: 'b' }), makeFinding({ project_id: 'a' })]);
    expect(groups.get('a')).toHaveLength(2);
    expect(groups.get('b')).toHaveLength(1);
  });
});
