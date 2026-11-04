import { Download, FileUp, Pencil, Trash2 } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { listProjectFindingsFull } from '../api/findings';
import { useFindings, useIsAdmin, useMemberEmail, useProjects } from '../api/queries';
import { FindingsBrowser } from '../components/FindingsBrowser';
import { ProjectFormDialog } from '../components/ProjectForm';
import { DeleteProjectDialog } from '../components/RowActions';
import { SeverityDonut } from '../components/SeverityDonut';
import { TrivyImportDialog } from '../components/TrivyImportDialog';
import { Button, Card, EmptyState, ErrorNote, Loading, PageHeader, ProgressCell, ProjectStatusBadge } from '../components/ui';
import { PROJECT_KIND_LABELS } from '../lib/domain';
import { errorMessage } from '../lib/errors';
import { formatPeriod } from '../lib/format';
import { buildProjectReport, downloadTextFile, reportFileName } from '../lib/report';
import { projectProgress, severityBreakdown } from '../lib/stats';
import { safeHttpUrl } from '../lib/url';

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-ink-muted">{label}</dt>
      <dd className="mt-1 text-sm [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

export function ProjectDetailPage() {
  const { projectId = '' } = useParams();
  const navigate = useNavigate();
  const projects = useProjects();
  const findings = useFindings();
  const [dialog, setDialog] = useState<'edit' | 'delete' | 'import' | null>(null);
  const isAdmin = useIsAdmin();
  const memberEmail = useMemberEmail();
  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const project = projects.data?.find((item) => item.id === projectId);
  const projectFindings = useMemo(
    () => (findings.data ?? []).filter((finding) => finding.project_id === projectId),
    [findings.data, projectId],
  );

  const error = projects.error ?? findings.error;
  if (error) return <ErrorNote>{errorMessage(error)}</ErrorNote>;
  if (projects.isPending || findings.isPending) return <Loading />;
  if (!project) {
    return (
      <EmptyState title="プロジェクトが見つかりません。">
        <Link to="/projects" className="font-semibold text-brand-700 hover:underline">
          プロジェクト一覧へ戻る
        </Link>
      </EmptyState>
    );
  }

  const downloadReport = async () => {
    setReportBusy(true);
    setReportError(null);
    try {
      const full = await listProjectFindingsFull(project.id);
      downloadTextFile(reportFileName(project), buildProjectReport(project, full));
    } catch (cause) {
      setReportError(errorMessage(cause));
    } finally {
      setReportBusy(false);
    }
  };

  const targetUrl = safeHttpUrl(project.target);
  const progress = projectProgress(project, projectFindings);

  return (
    <>
      <PageHeader
        title={project.name}
        actions={
          <>
            <Button onClick={() => setDialog('import')}>
              <FileUp className="h-4 w-4" aria-hidden />
              Trivy 取り込み
            </Button>
            <Button onClick={() => void downloadReport()} loading={reportBusy}>
              {reportBusy ? null : <Download className="h-4 w-4" aria-hidden />}
              報告書を出力
            </Button>
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
          </>
        }
      />
      {reportError ? (
        <div className="mb-4">
          <ErrorNote>{reportError}</ErrorNote>
        </div>
      ) : null}

      <div className="mb-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <Card title="概要">
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Info label="クライアント">{project.client ?? '—'}</Info>
            <Info label="種別">{PROJECT_KIND_LABELS[project.kind]}</Info>
            <Info label="ステータス">
              <ProjectStatusBadge status={project.status} />
            </Info>
            <Info label="対象">
              {targetUrl ? (
                <a
                  href={targetUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="font-mono text-xs text-brand-700 hover:underline"
                >
                  {project.target}
                </a>
              ) : (
                <span className="font-mono text-xs">{project.target ?? '—'}</span>
              )}
            </Info>
            <Info label="期間">{formatPeriod(project.start_date, project.end_date)}</Info>
            <Info label="作成者">{memberEmail(project.created_by)}</Info>
            <Info label="更新者">{memberEmail(project.updated_by)}</Info>
            <Info label="進捗">
              <ProgressCell completed={project.status === 'completed'} percent={progress.percent} />
            </Info>
          </dl>
          {project.notes ? (
            <div className="mt-4 border-t border-line-soft pt-4">
              <Info label="メモ">
                <span className="whitespace-pre-wrap">{project.notes}</span>
              </Info>
            </div>
          ) : null}
        </Card>
        <Card title="検出事項の内訳">
          <SeverityDonut counts={severityBreakdown(projectFindings)} />
        </Card>
      </div>

      <Card title="検出事項">
        <FindingsBrowser
          findings={projectFindings}
          projects={projects.data ?? []}
          fixedProjectId={project.id}
        />
      </Card>

      {dialog === 'edit' ? <ProjectFormDialog project={project} onClose={() => setDialog(null)} /> : null}
      {dialog === 'import' ? <TrivyImportDialog project={project} onClose={() => setDialog(null)} /> : null}
      {dialog === 'delete' ? (
        <DeleteProjectDialog
          project={project}
          findingCount={projectFindings.length}
          onClose={() => setDialog(null)}
          onDeleted={() => navigate('/projects', { replace: true })}
        />
      ) : null}
    </>
  );
}
