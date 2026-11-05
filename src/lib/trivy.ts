import type { Severity } from './domain';

export const MAX_TRIVY_FILE_BYTES = 20 * 1024 * 1024;

const MAX_TITLE = 500;
const MAX_KEY = 480;
const MAX_LOCATION = 3500;
const MAX_TEXT = 20_000;
const MAX_REFERENCES = 10;

/** import_trivy_findings の p_items の 1 要素。 */
export interface TrivyImportItem {
  title: string;
  severity: Severity;
  cve: string | null;
  cwe: string | null;
  cvss_score: number | null;
  cvss_vector: string | null;
  affected_location: string | null;
  description: string | null;
  remediation: string | null;
  source_target: string;
  source_rule_id: string;
  source_package: string;
}

export interface TrivyParseSummary {
  vulnerabilities: number;
  misconfigurations: number;
  /** Status が FAIL ではなかった設定チェック。 */
  excludedNonFail: number;
  /** 対象ファイル + ID + パッケージ名 が同じで、1 件にまとめた数。 */
  duplicates: number;
  /** ID が無いなどで取り込めなかった項目。 */
  invalid: number;
  /** 取り込み対象外のシークレット検出。値は保存しない。 */
  secretsIgnored: number;
}

export interface TrivyParseResult {
  items: TrivyImportItem[];
  summary: TrivyParseSummary;
}

export class TrivyParseError extends Error {}

type Dict = Record<string, unknown>;

function isDict(value: unknown): value is Dict {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Postgres の jsonb が受け取れない文字（NUL、対になっていないサロゲート）と
 * 改行・タブ以外の制御文字を取り除く。切り詰めで壊れたサロゲートもここで直す。
 */
function clean(value: string, max: number): string {
  return value
    .slice(0, max)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '�')
    .trim();
}

function text(value: unknown, max = MAX_TEXT): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return null;
  const cleaned = clean(value, max);
  return cleaned === '' ? null : cleaned;
}

function joinBlocks(blocks: Array<string | null | undefined>): string | null {
  const joined = blocks.filter((block): block is string => Boolean(block)).join('\n\n');
  return joined === '' ? null : clean(joined, MAX_TEXT);
}

function toSeverity(value: unknown): Severity {
  switch (typeof value === 'string' ? value.trim().toUpperCase() : '') {
    case 'CRITICAL':
      return 'critical';
    case 'HIGH':
      return 'high';
    case 'MEDIUM':
      return 'medium';
    case 'LOW':
      return 'low';
    default:
      // UNKNOWN や欠落は深刻度を決められないので「情報」にする。
      return 'info';
  }
}

function pickCvss(vuln: Dict): { score: number | null; vector: string | null } {
  const cvss = vuln.CVSS;
  if (!isDict(cvss)) return { score: null, vector: null };
  const preferred = [text(vuln.SeveritySource), 'nvd', ...Object.keys(cvss)];
  for (const source of preferred) {
    const entry = source ? cvss[source] : undefined;
    if (!isDict(entry)) continue;
    for (const [scoreKey, vectorKey] of [
      ['V40Score', 'V40Vector'],
      ['V3Score', 'V3Vector'],
      ['V2Score', 'V2Vector'],
    ] as const) {
      const raw = entry[scoreKey];
      const score = typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 && raw <= 10 ? raw : null;
      const vector = text(entry[vectorKey], 400);
      if (score !== null || vector !== null) return { score, vector };
    }
  }
  return { score: null, vector: null };
}

function lineRange(cause: unknown): string {
  if (!isDict(cause) || typeof cause.StartLine !== 'number' || cause.StartLine <= 0) return '';
  const { StartLine: start, EndLine: end } = cause;
  return typeof end === 'number' && end > start ? `:${start}-${end}` : `:${start}`;
}

function references(value: unknown, primary: unknown): string | null {
  const urls = [primary, ...asArray(value)]
    .map((url) => text(url, 1000))
    .filter((url): url is string => url !== null);
  const unique = [...new Set(urls)].slice(0, MAX_REFERENCES);
  return unique.length > 0 ? `参考:\n${unique.join('\n')}` : null;
}

function vulnerabilityItem(vuln: Dict, target: string): TrivyImportItem | null {
  const id = text(vuln.VulnerabilityID, MAX_KEY);
  if (!id) return null;
  const pkg = text(vuln.PkgName, MAX_KEY) ?? '';
  const installed = text(vuln.InstalledVersion, 200);
  const fixed = text(vuln.FixedVersion, 200);
  const cwe = asArray(vuln.CweIDs)
    .map((entry) => text(entry, 40))
    .filter((entry): entry is string => entry !== null)
    .slice(0, 10)
    .join(', ');
  const { score, vector } = pickCvss(vuln);
  const packageLabel = pkg ? `${pkg}${installed ? `@${installed}` : ''}` : '';
  const pkgPath = text(vuln.PkgPath, 1000);

  return {
    title: clean(`${id}: ${text(vuln.Title, MAX_TITLE) ?? (pkg || '脆弱性')}`, MAX_TITLE),
    severity: toSeverity(vuln.Severity),
    cve: /^CVE-\d{4}-\d{4,}$/i.test(id) ? id.toUpperCase() : null,
    cwe: cwe || null,
    cvss_score: score,
    cvss_vector: vector,
    affected_location: clean(
      [pkgPath ?? target, packageLabel].filter(Boolean).join(' / '),
      MAX_LOCATION,
    ),
    description: joinBlocks([text(vuln.Description), references(vuln.References, vuln.PrimaryURL)]),
    remediation: fixed && pkg ? `${pkg} を ${fixed} 以上に更新する。` : null,
    source_target: target,
    source_rule_id: id,
    source_package: pkg,
  };
}

/**
 * 手元のコードをクラウドに置かないよう、CauseMetadata.Code の本文は保存しない。
 * 位置はファイル名と行番号で残す。
 */
function misconfigurationItem(check: Dict, target: string): TrivyImportItem | null {
  const id = text(check.ID, MAX_KEY) ?? text(check.AVDID, MAX_KEY);
  if (!id) return null;

  return {
    title: clean(`${id}: ${text(check.Title, MAX_TITLE) ?? '設定の不備'}`, MAX_TITLE),
    severity: toSeverity(check.Severity),
    cve: null,
    cwe: null,
    cvss_score: null,
    cvss_vector: null,
    affected_location: clean(`${target}${lineRange(check.CauseMetadata)}`, MAX_LOCATION),
    description: joinBlocks([
      text(check.Description),
      text(check.Message),
      references(check.References, check.PrimaryURL),
    ]),
    remediation: text(check.Resolution),
    source_target: target,
    source_rule_id: id,
    source_package: '',
  };
}

/** 既に解析済みの値から検出事項を作る。中身は信頼しないので、型が違う項目は欠落として扱う。 */
export function parseTrivyReport(report: unknown): TrivyParseResult {
  if (!isDict(report)) {
    throw new TrivyParseError('Trivy の JSON ではありません（最上位がオブジェクトではありません）。');
  }

  const byKey = new Map<string, TrivyImportItem>();
  const summary: TrivyParseSummary = {
    vulnerabilities: 0,
    misconfigurations: 0,
    excludedNonFail: 0,
    duplicates: 0,
    invalid: 0,
    secretsIgnored: 0,
  };

  const add = (item: TrivyImportItem, kind: 'vulnerabilities' | 'misconfigurations') => {
    const key = JSON.stringify([item.source_target, item.source_rule_id, item.source_package]);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, item);
      summary[kind] += 1;
      return;
    }
    summary.duplicates += 1;
    // 同じ指摘が別の行にもある場合、位置の情報だけは失わないようにする。
    const location = item.affected_location;
    if (location && !(existing.affected_location ?? '').split(', ').includes(location)) {
      existing.affected_location = clean(
        [existing.affected_location, location].filter(Boolean).join(', '),
        MAX_LOCATION,
      );
    }
  };

  for (const result of asArray(report.Results)) {
    if (!isDict(result)) continue;
    const target = text(result.Target, MAX_KEY) ?? '(対象不明)';

    summary.secretsIgnored += asArray(result.Secrets).length;

    for (const vuln of asArray(result.Vulnerabilities)) {
      const item = isDict(vuln) ? vulnerabilityItem(vuln, target) : null;
      if (item) add(item, 'vulnerabilities');
      else summary.invalid += 1;
    }

    for (const check of asArray(result.Misconfigurations)) {
      if (!isDict(check)) {
        summary.invalid += 1;
        continue;
      }
      if (check.Status !== 'FAIL') {
        summary.excludedNonFail += 1;
        continue;
      }
      const item = misconfigurationItem(check, target);
      if (item) add(item, 'misconfigurations');
      else summary.invalid += 1;
    }
  }

  return { items: [...byKey.values()], summary };
}

/** JSON の文字列を解析する。壊れた JSON は日本語のエラーにする。 */
export function parseTrivyJson(json: string): TrivyParseResult {
  let report: unknown;
  try {
    report = JSON.parse(json.replace(/^﻿/, ''));
  } catch {
    throw new TrivyParseError('JSON として読み取れませんでした。ファイルの中身を確認してください。');
  }
  return parseTrivyReport(report);
}

/** 選ばれたファイルを読む前にサイズを確かめる。 */
export async function readTrivyFile(file: Pick<File, 'size' | 'text'>): Promise<TrivyParseResult> {
  if (file.size > MAX_TRIVY_FILE_BYTES) {
    throw new TrivyParseError(
      `ファイルが大きすぎます（上限 ${MAX_TRIVY_FILE_BYTES / 1024 / 1024}MB）。`,
    );
  }
  return parseTrivyJson(await file.text());
}

export function trivyItemKey(
  item: Pick<TrivyImportItem, 'source_target' | 'source_rule_id' | 'source_package'>,
): string {
  return JSON.stringify([item.source_target, item.source_rule_id, item.source_package]);
}
