import {
  FINDING_STATUS_LABELS,
  PROJECT_KIND_LABELS,
  PROJECT_STATUS_LABELS,
  REPORT_STATUS_LABELS,
  SEVERITIES,
  SEVERITY_LABELS,
  SOURCE_LABELS,
  VERIFICATION_LABELS,
  type Finding,
  type Project,
} from './domain';
import { formatDate, formatPeriod, safeFileName } from './format';
import { severityBreakdown, totalOf } from './stats';
import { safeHttpUrl } from './url';

/**
 * 取り込みデータも報告書に入るので、Markdown や HTML として解釈される記号を無効にする。
 * これで報告書を開いた先で画像の読み込みやリンクの偽装が起きない。
 */
function escapeSymbols(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/[\\`*_{}[\]()#+!|~]/g, '\\$&');
}

function escapeInline(value: string): string {
  return escapeSymbols(value.replace(/\r\n?|\n/g, ' '));
}

function escapeBlock(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => escapeSymbols(line).replace(/^(\s*)([-=]{3,}|-\s|\d+[.)]\s)/, '$1\\$2'))
    .join('  \n');
}

/** 行頭の字下げがコードブロックにならないよう、ブロックの先頭の空白を詰める。 */
function section(title: string, value: string | null): string[] {
  if (!value || value.trim() === '') return [];
  return [`#### ${title}`, '', escapeBlock(value.trim()).replace(/^[ \t]+/gm, ''), ''];
}

/** 未報告の詳細は手元で管理するので、再現手順が空なら手元メモへの参照を示す。 */
function reproductionSection(finding: Finding): string[] {
  const reference = finding.local_reference ? `（${code(finding.local_reference)}）` : '';
  if (!finding.reproduction_steps || finding.reproduction_steps.trim() === '') {
    return ['#### 再現手順', '', `手元メモ参照${reference}`, ''];
  }
  const lines = section('再現手順', finding.reproduction_steps);
  return finding.local_reference ? [...lines, `手元メモ: ${code(finding.local_reference)}`, ''] : lines;
}

function plain(value: string | null | undefined): string {
  return value && value.trim() !== '' ? escapeInline(value.trim()) : '—';
}

function code(value: string | null | undefined): string {
  if (!value) return '—';
  const inline = value.replace(/\s+/g, ' ').trim();
  const longest = Math.max(0, ...(inline.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(longest + 1);
  return `${fence} ${inline} ${fence}`;
}

function findingOrder(a: Finding, b: Finding): number {
  return SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) || a.seq - b.seq;
}

/** プロジェクト単位の報告書。誤検知は件数にも詳細にも入れず、除外した数だけ記す。 */
export function buildProjectReport(
  project: Project,
  findings: readonly Finding[],
  generatedAt: Date = new Date(),
): string {
  const counted = findings.filter((finding) => finding.status !== 'false_positive').sort(findingOrder);
  const excluded = findings.length - counted.length;
  const counts = severityBreakdown(counted);

  const lines: string[] = [
    `# ${plain(project.name)} 報告書`,
    '',
    '## 概要',
    '',
    `- **クライアント:** ${plain(project.client)}`,
    `- **対象:** ${plain(project.target)}`,
    `- **種別:** ${PROJECT_KIND_LABELS[project.kind]}`,
    `- **ステータス:** ${PROJECT_STATUS_LABELS[project.status]}`,
    `- **期間:** ${formatPeriod(project.start_date, project.end_date)}`,
    `- **出力日:** ${formatDate(generatedAt.toISOString())}`,
  ];
  if (project.notes?.trim()) lines.push('', '**メモ**', '', escapeBlock(project.notes.trim()));

  lines.push(
    '',
    '## 深刻度別の件数',
    '',
    '| 深刻度 | 件数 |',
    '| --- | ---: |',
    ...SEVERITIES.map((severity) => `| ${SEVERITY_LABELS[severity]} | ${counts[severity]} |`),
    `| 合計 | ${totalOf(counts)} |`,
    '',
  );
  if (excluded > 0) lines.push(`誤検知 ${excluded} 件は集計と詳細から除いています。`, '');

  lines.push('## 検出事項', '');
  if (counted.length === 0) {
    lines.push('検出事項はありません。', '');
    return lines.join('\n');
  }

  for (const finding of counted) {
    const reportUrl = safeHttpUrl(finding.report_url);
    lines.push(
      `### ${finding.ref_id} ${plain(finding.title)}`,
      '',
      `- **深刻度:** ${SEVERITY_LABELS[finding.severity]}`,
      `- **ステータス:** ${FINDING_STATUS_LABELS[finding.status]}`,
      `- **検証状況:** ${VERIFICATION_LABELS[finding.verification_status]}`,
      `- **報告状況:** ${REPORT_STATUS_LABELS[finding.report_status]}`,
      `- **報告先:** ${reportUrl ? `<${reportUrl}>` : '—'}`,
      `- **報告日:** ${formatDate(finding.reported_on)}`,
      `- **CVE:** ${plain(finding.cve)}`,
      `- **CWE:** ${plain(finding.cwe)}`,
      `- **CVSS:** ${finding.cvss_score ?? '—'}${finding.cvss_vector ? ` ${code(finding.cvss_vector)}` : ''}`,
      `- **影響を受ける箇所:** ${code(finding.affected_location)}`,
      `- **取得元:** ${SOURCE_LABELS[finding.source]}`,
      '',
      ...section('説明', finding.description),
      ...reproductionSection(finding),
      ...section('影響', finding.impact),
      ...section('修正案', finding.remediation),
    );
  }
  return lines.join('\n');
}

export function reportFileName(project: Pick<Project, 'name'>, generatedAt: Date = new Date()): string {
  const date = formatDate(generatedAt.toISOString()).replace(/\//g, '-');
  return `report-${safeFileName(project.name)}-${date}.md`;
}

export function downloadTextFile(fileName: string, content: string, type = 'text/markdown;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
