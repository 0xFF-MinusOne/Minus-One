import { useMutation, useQuery } from '@tanstack/react-query';
import { TriangleAlert } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { createFinding, getFinding, updateFinding } from '../api/findings';
import { queryKeys, useProjects, useRefreshData } from '../api/queries';
import {
  FINDING_STATUSES,
  FINDING_STATUS_LABELS,
  REPORT_STATUSES,
  REPORT_STATUS_LABELS,
  SEVERITIES,
  SEVERITY_LABELS,
  VERIFICATION_LABELS,
  VERIFICATION_STATUSES,
  type Finding,
  type FindingInsert,
  type FindingStatus,
  type ReportStatus,
  type Severity,
  type VerificationStatus,
} from '../lib/domain';
import { errorMessage } from '../lib/errors';
import { emptyToNull } from '../lib/format';
import { safeHttpUrl } from '../lib/url';
import { Button, ConfirmDialog, ErrorNote, Field, Loading, Modal } from './ui';

const SENSITIVE_NOTICE = '未報告の脆弱性の詳細は入力せず、手元で管理してください';

/** 修正や公開が済むまでは、再現手順をクラウドに置く前に確認する。 */
const CONFIRM_REPRODUCTION_STATUSES: ReadonlySet<ReportStatus> = new Set(['not_reported', 'reported', 'accepted']);

function Form({
  finding,
  defaultProjectId,
  onClose,
  onSaved,
}: {
  finding?: Finding;
  defaultProjectId?: string;
  onClose: () => void;
  onSaved?: (finding: Finding) => void;
}) {
  const refresh = useRefreshData();
  const projects = useProjects();
  const [projectId, setProjectId] = useState(finding?.project_id ?? defaultProjectId ?? '');
  const [title, setTitle] = useState(finding?.title ?? '');
  const [severity, setSeverity] = useState<Severity>(finding?.severity ?? 'medium');
  const [status, setStatus] = useState<FindingStatus>(finding?.status ?? 'open');
  const [verification, setVerification] = useState<VerificationStatus>(finding?.verification_status ?? 'unverified');
  const [report, setReport] = useState<ReportStatus>(finding?.report_status ?? 'not_reported');
  const [reportUrl, setReportUrl] = useState(finding?.report_url ?? '');
  const [reportedOn, setReportedOn] = useState(finding?.reported_on ?? '');
  const [cve, setCve] = useState(finding?.cve ?? '');
  const [cwe, setCwe] = useState(finding?.cwe ?? '');
  const [cvssScore, setCvssScore] = useState(finding?.cvss_score?.toString() ?? '');
  const [cvssVector, setCvssVector] = useState(finding?.cvss_vector ?? '');
  const [location, setLocation] = useState(finding?.affected_location ?? '');
  const [description, setDescription] = useState(finding?.description ?? '');
  const [reproduction, setReproduction] = useState(finding?.reproduction_steps ?? '');
  const [impact, setImpact] = useState(finding?.impact ?? '');
  const [remediation, setRemediation] = useState(finding?.remediation ?? '');
  const [localReference, setLocalReference] = useState(finding?.local_reference ?? '');
  const [pendingSave, setPendingSave] = useState<FindingInsert | null>(null);
  const [validation, setValidation] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (values: FindingInsert) =>
      finding ? updateFinding(finding.id, values) : createFinding(values),
    onSuccess: async (saved) => {
      await refresh();
      onSaved?.(saved);
      onClose();
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!projectId) return setValidation('プロジェクトを選んでください。');
    if (title.trim() === '') return setValidation('タイトルを入力してください。');
    const score = cvssScore.trim() === '' ? null : Number(cvssScore);
    if (score !== null && !(score >= 0 && score <= 10)) {
      return setValidation('CVSS スコアは 0 から 10 の数値で入力してください。');
    }
    const url = emptyToNull(reportUrl);
    if (url && !safeHttpUrl(url)) {
      return setValidation('報告先 URL は http または https で始まる形式で入力してください。');
    }
    setValidation(null);
    const values: FindingInsert = {
      project_id: projectId,
      title: title.trim(),
      severity,
      status,
      verification_status: verification,
      report_status: report,
      report_url: url,
      reported_on: reportedOn || null,
      cve: emptyToNull(cve),
      cwe: emptyToNull(cwe),
      cvss_score: score,
      cvss_vector: emptyToNull(cvssVector),
      affected_location: emptyToNull(location),
      description: emptyToNull(description),
      reproduction_steps: emptyToNull(reproduction),
      impact: emptyToNull(impact),
      remediation: emptyToNull(remediation),
      local_reference: emptyToNull(localReference),
    };
    if (emptyToNull(reproduction) && CONFIRM_REPRODUCTION_STATUSES.has(report)) {
      setPendingSave(values);
      return;
    }
    save.mutate(values);
  };

  return (
    <>
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
      <Field label="プロジェクト" required>
        <select className="field-control" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">選択してください</option>
          {projects.data?.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="深刻度" required>
        <select className="field-control" value={severity} onChange={(e) => setSeverity(e.target.value as Severity)}>
          {SEVERITIES.map((value) => (
            <option key={value} value={value}>
              {SEVERITY_LABELS[value]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="タイトル" required className="sm:col-span-2">
        <input className="field-control" value={title} maxLength={1000} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="ステータス">
        <select className="field-control" value={status} onChange={(e) => setStatus(e.target.value as FindingStatus)}>
          {FINDING_STATUSES.map((value) => (
            <option key={value} value={value}>
              {FINDING_STATUS_LABELS[value]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="検証状況">
        <select
          className="field-control"
          value={verification}
          onChange={(e) => setVerification(e.target.value as VerificationStatus)}
        >
          {VERIFICATION_STATUSES.map((value) => (
            <option key={value} value={value}>
              {VERIFICATION_LABELS[value]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="報告状況">
        <select className="field-control" value={report} onChange={(e) => setReport(e.target.value as ReportStatus)}>
          {REPORT_STATUSES.map((value) => (
            <option key={value} value={value}>
              {REPORT_STATUS_LABELS[value]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="報告日">
        <input type="date" className="field-control" value={reportedOn} onChange={(e) => setReportedOn(e.target.value)} />
      </Field>
      <Field label="報告先 URL" className="sm:col-span-2">
        <input
          type="url"
          className="field-control font-mono"
          placeholder="https://"
          value={reportUrl}
          maxLength={2000}
          onChange={(e) => setReportUrl(e.target.value)}
        />
      </Field>
      <Field label="CVE">
        <input className="field-control font-mono" value={cve} maxLength={100} onChange={(e) => setCve(e.target.value)} />
      </Field>
      <Field label="CWE">
        <input className="field-control font-mono" value={cwe} maxLength={500} onChange={(e) => setCwe(e.target.value)} />
      </Field>
      <Field label="CVSS スコア">
        <input
          type="number"
          step="0.1"
          min="0"
          max="10"
          className="field-control font-mono"
          value={cvssScore}
          onChange={(e) => setCvssScore(e.target.value)}
        />
      </Field>
      <Field label="CVSS ベクター">
        <input className="field-control font-mono" value={cvssVector} maxLength={500} onChange={(e) => setCvssVector(e.target.value)} />
      </Field>
      <Field label="影響を受ける箇所" className="sm:col-span-2">
        <input className="field-control font-mono" value={location} maxLength={4000} onChange={(e) => setLocation(e.target.value)} />
      </Field>
      <Field label="手元メモの参照" hint="手元で管理しているファイル名や識別子。リンクにはなりません。" className="sm:col-span-2">
        <input className="field-control font-mono" value={localReference} maxLength={500} onChange={(e) => setLocalReference(e.target.value)} />
      </Field>
      <p role="note" className="flex items-start gap-2 rounded-lg bg-[#FEF1E6] px-3 py-2 text-sm font-semibold text-[#8A4308] sm:col-span-2">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        {SENSITIVE_NOTICE}
      </p>
      <Field label="説明" className="sm:col-span-2">
        <textarea className="field-control min-h-24" value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label="再現手順" className="sm:col-span-2">
        <textarea className="field-control min-h-24" value={reproduction} onChange={(e) => setReproduction(e.target.value)} />
      </Field>
      <Field label="影響" className="sm:col-span-2">
        <textarea className="field-control min-h-20" value={impact} onChange={(e) => setImpact(e.target.value)} />
      </Field>
      <Field label="修正案" className="sm:col-span-2">
        <textarea className="field-control min-h-20" value={remediation} onChange={(e) => setRemediation(e.target.value)} />
      </Field>
      <div className="space-y-3 sm:col-span-2">
        {validation ? <ErrorNote>{validation}</ErrorNote> : null}
        {save.error ? <ErrorNote>{errorMessage(save.error)}</ErrorNote> : null}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} disabled={save.isPending}>
            キャンセル
          </Button>
          <Button type="submit" variant="primary" loading={save.isPending}>
            保存
          </Button>
        </div>
      </div>
    </form>
    {pendingSave ? (
      <ConfirmDialog
        title="再現手順を保存しますか"
        message={
          <>
            <p>
              報告状況が「{REPORT_STATUS_LABELS[report]}」のまま、再現手順をクラウドに保存しようとしています。
            </p>
            <p className="mt-2">{SENSITIVE_NOTICE}。</p>
          </>
        }
        confirmLabel="このまま保存する"
        busy={save.isPending}
        error={save.error ? errorMessage(save.error) : null}
        onConfirm={() => save.mutate(pendingSave)}
        onClose={() => {
          setPendingSave(null);
          save.reset();
        }}
      />
    ) : null}
    </>
  );
}

/** 新規作成、または編集。編集で本文が手元に無いときは、読み込んでからフォームを出す。 */
export function FindingFormDialog({
  finding,
  findingId,
  defaultProjectId,
  onClose,
  onSaved,
}: {
  finding?: Finding;
  findingId?: string;
  defaultProjectId?: string;
  onClose: () => void;
  onSaved?: (finding: Finding) => void;
}) {
  const needsFetch = !finding && Boolean(findingId);
  const loaded = useQuery({
    queryKey: queryKeys.finding(findingId ?? ''),
    queryFn: () => getFinding(findingId ?? ''),
    enabled: needsFetch,
  });
  const current = finding ?? loaded.data ?? undefined;
  const editing = Boolean(finding || findingId);

  return (
    <Modal title={editing ? '検出事項を編集' : '検出事項を追加'} onClose={onClose} wide>
      {needsFetch && loaded.isPending ? <Loading /> : null}
      {needsFetch && !loaded.isPending && !current ? (
        <ErrorNote>{loaded.error ? errorMessage(loaded.error) : '検出事項が見つかりません。'}</ErrorNote>
      ) : null}
      {!needsFetch || current ? (
        <Form finding={current} defaultProjectId={defaultProjectId} onClose={onClose} onSaved={onSaved} />
      ) : null}
    </Modal>
  );
}
