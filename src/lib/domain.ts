import type { Database } from './database.types';

type Enums = Database['public']['Enums'];
export type ProjectKind = Enums['project_kind'];
export type ProjectStatus = Enums['project_status'];
export type Severity = Enums['finding_severity'];
export type FindingStatus = Enums['finding_status'];
export type VerificationStatus = Enums['verification_status'];
export type ReportStatus = Enums['report_status'];
export type FindingSource = Enums['finding_source'];

export type Project = Database['public']['Tables']['projects']['Row'];
export type ProjectInsert = Database['public']['Tables']['projects']['Insert'];
export type Finding = Database['public']['Tables']['findings']['Row'];
export type FindingInsert = Database['public']['Tables']['findings']['Insert'];

/** 一覧と集計に使う列だけを持つ検出事項。本文は詳細画面と報告書で読み込む。 */
export const FINDING_LIST_COLUMNS =
  'id,project_id,seq,ref_id,title,severity,status,verification_status,report_status,cve,cwe,affected_location,source,source_rule_id,created_at,updated_at,resolved_at' as const;

export type FindingListItem = Pick<
  Finding,
  | 'id'
  | 'project_id'
  | 'seq'
  | 'ref_id'
  | 'title'
  | 'severity'
  | 'status'
  | 'verification_status'
  | 'report_status'
  | 'cve'
  | 'cwe'
  | 'affected_location'
  | 'source'
  | 'source_rule_id'
  | 'created_at'
  | 'updated_at'
  | 'resolved_at'
>;

export const SEVERITIES: readonly Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
export const SEVERITY_LABELS: Record<Severity, string> = {
  critical: '緊急',
  high: '高',
  medium: '中',
  low: '低',
  info: '情報',
};
/** 円グラフとバッジの点の色。文字色には使わない。 */
export const SEVERITY_COLORS: Record<Severity, string> = {
  critical: '#C92A45',
  high: '#EE7B1E',
  medium: '#CDB800',
  low: '#2F7FE3',
  info: '#8A94A6',
};

export const FINDING_STATUSES: readonly FindingStatus[] = [
  'open',
  'in_progress',
  'fix_verifying',
  'resolved',
  'risk_accepted',
  'false_positive',
];
export const FINDING_STATUS_LABELS: Record<FindingStatus, string> = {
  open: '未対応',
  in_progress: '対応中',
  fix_verifying: '修正確認中',
  resolved: '解決済み',
  risk_accepted: 'リスク受容',
  false_positive: '誤検知',
};

export const VERIFICATION_STATUSES: readonly VerificationStatus[] = [
  'unverified',
  'code_confirmed',
  'reproduced',
];
export const VERIFICATION_LABELS: Record<VerificationStatus, string> = {
  unverified: '未検証',
  code_confirmed: 'コード確定',
  reproduced: '再現済み',
};

export const REPORT_STATUSES: readonly ReportStatus[] = [
  'not_reported',
  'reported',
  'accepted',
  'fixed',
  'disclosed',
  'not_applicable',
];
export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  not_reported: '未報告',
  reported: '報告済み',
  accepted: '受理',
  fixed: '修正済み',
  disclosed: '公開済み',
  not_applicable: '対象外',
};

export const PROJECT_KINDS: readonly ProjectKind[] = ['oss_research', 'client_engagement', 'internal'];
export const PROJECT_KIND_LABELS: Record<ProjectKind, string> = {
  oss_research: 'OSS 調査',
  client_engagement: '顧客案件',
  internal: '社内',
};

export const PROJECT_STATUSES: readonly ProjectStatus[] = ['planning', 'active', 'completed'];
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  planning: '計画中',
  active: '進行中',
  completed: '完了',
};

export const SOURCE_LABELS: Record<FindingSource, string> = {
  manual: '手入力',
  trivy: 'Trivy',
};
