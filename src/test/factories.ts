import type { Finding, FindingListItem, Project } from '../lib/domain';

export function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    name: '架空の診断',
    client: '架空株式会社',
    target: 'https://example.test',
    kind: 'client_engagement',
    status: 'active',
    start_date: '2026-10-01',
    end_date: '2026-10-31',
    notes: null,
    created_by: 'u1',
    updated_by: 'u1',
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    ...overrides,
  };
}

export function makeFinding(overrides: Partial<Finding> = {}): Finding {
  const seq = overrides.seq ?? 1;
  return {
    id: `f${seq}`,
    project_id: 'p1',
    seq,
    ref_id: `PEN-${String(seq).padStart(4, '0')}`,
    title: '架空の検出事項',
    severity: 'medium',
    status: 'open',
    verification_status: 'unverified',
    report_status: 'not_reported',
    report_url: null,
    reported_on: null,
    cve: null,
    cwe: null,
    cvss_score: null,
    cvss_vector: null,
    affected_location: null,
    description: null,
    reproduction_steps: null,
    impact: null,
    remediation: null,
    local_reference: null,
    created_by: 'u1',
    updated_by: 'u1',
    source: 'manual',
    source_target: null,
    source_rule_id: null,
    source_package: null,
    resolved_at: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    ...overrides,
  };
}

export function makeListItem(overrides: Partial<FindingListItem> = {}): FindingListItem {
  return makeFinding(overrides);
}
