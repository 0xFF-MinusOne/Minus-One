import { Pencil, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useFinding, useIsAdmin, useMemberEmail, useProjects } from '../api/queries';
import { FindingFormDialog } from '../components/FindingForm';
import { DeleteFindingDialog } from '../components/RowActions';
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Loading,
  ReportBadge,
  SeverityBadge,
  StatusBadge,
  VerificationBadge,
} from '../components/ui';
import { SOURCE_LABELS } from '../lib/domain';
import { errorMessage } from '../lib/errors';
import { formatDate } from '../lib/format';
import { safeHttpUrl } from '../lib/url';

function Info({ label, mono, children }: { label: string; mono?: boolean; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold text-ink-muted">{label}</dt>
      <dd className={`mt-1 text-sm [overflow-wrap:anywhere] ${mono ? 'font-mono text-xs' : ''}`}>{children}</dd>
    </div>
  );
}

function TextBlock({ title, value }: { title: string; value: string | null }) {
  return (
    <Card title={title}>
      {value ? (
        <p className="whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">{value}</p>
      ) : (
        <p className="text-sm text-ink-muted">未記入</p>
      )}
    </Card>
  );
}

export function FindingDetailPage() {
  const { findingId = '' } = useParams();
  const navigate = useNavigate();
  const finding = useFinding(findingId);
  const projects = useProjects();
  const isAdmin = useIsAdmin();
  const memberEmail = useMemberEmail();
  const [dialog, setDialog] = useState<'edit' | 'delete' | null>(null);

  if (finding.error) return <ErrorNote>{errorMessage(finding.error)}</ErrorNote>;
  if (finding.isPending) return <Loading />;
  const current = finding.data;
  if (!current) {
    return (
      <EmptyState title="検出事項が見つかりません。">
        <Link to="/findings" className="font-semibold text-brand-700 hover:underline">
          検出事項の一覧へ戻る
        </Link>
      </EmptyState>
    );
  }

  const project = projects.data?.find((item) => item.id === current.project_id);
  const reportUrl = safeHttpUrl(current.report_url);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-sm font-semibold text-brand-700">{current.ref_id}</p>
          <h1 className="mt-1 text-2xl font-bold [overflow-wrap:anywhere] [word-break:keep-all]">{current.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <SeverityBadge severity={current.severity} />
            <StatusBadge status={current.status} />
            <VerificationBadge status={current.verification_status} />
            <ReportBadge status={current.report_status} />
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setDialog('edit')}>
            <Pencil className="h-4 w-4" aria-hidden />
            編集
          </Button>
          {isAdmin ? (
            <Button onClick={() => setDialog('delete')}>
              <Trash2 className="h-4 w-4" aria-hidden />
              削除
            </Button>
          ) : null}
        </div>
      </div>

      <div className="space-y-5">
        <Card title="基本情報">
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Info label="プロジェクト">
              <Link to={`/projects/${current.project_id}`} className="font-semibold text-brand-700 hover:underline">
                {project?.name ?? 'プロジェクトを開く'}
              </Link>
            </Info>
            <Info label="取得元">{SOURCE_LABELS[current.source]}</Info>
            <Info label="作成日">{formatDate(current.created_at)}</Info>
            <Info label="更新日">{formatDate(current.updated_at)}</Info>
            <Info label="作成者">{memberEmail(current.created_by)}</Info>
            <Info label="更新者">{memberEmail(current.updated_by)}</Info>
            <Info label="手元メモの参照" mono>
              {current.local_reference ?? '—'}
            </Info>
            <Info label="CVE" mono>
              {current.cve ?? '—'}
            </Info>
            <Info label="CWE" mono>
              {current.cwe ?? '—'}
            </Info>
            <Info label="CVSS スコア" mono>
              {current.cvss_score ?? '—'}
            </Info>
            <Info label="CVSS ベクター" mono>
              {current.cvss_vector ?? '—'}
            </Info>
            <Info label="報告日">{formatDate(current.reported_on)}</Info>
            <Info label="報告先 URL" mono>
              {reportUrl ? (
                <a
                  href={reportUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="text-brand-700 hover:underline"
                >
                  {current.report_url}
                </a>
              ) : (
                (current.report_url ?? '—')
              )}
            </Info>
            <div className="sm:col-span-2">
              <Info label="影響を受ける箇所" mono>
                {current.affected_location ?? '—'}
              </Info>
            </div>
          </dl>
        </Card>
        <TextBlock title="説明" value={current.description} />
        {current.reproduction_steps ? (
          <TextBlock title="再現手順" value={current.reproduction_steps} />
        ) : (
          <Card title="再現手順">
            <p className="text-sm text-ink-soft [overflow-wrap:anywhere]">
              手元メモ参照
              {current.local_reference ? <span className="ml-2 font-mono text-xs">{current.local_reference}</span> : null}
            </p>
          </Card>
        )}
        <TextBlock title="影響" value={current.impact} />
        <TextBlock title="修正案" value={current.remediation} />
      </div>

      {dialog === 'edit' ? <FindingFormDialog finding={current} onClose={() => setDialog(null)} /> : null}
      {dialog === 'delete' ? (
        <DeleteFindingDialog
          finding={current}
          onClose={() => setDialog(null)}
          onDeleted={() => navigate('/findings', { replace: true })}
        />
      ) : null}
    </>
  );
}
