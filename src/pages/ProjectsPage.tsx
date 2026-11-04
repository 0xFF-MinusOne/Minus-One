import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFindings, useProjects } from '../api/queries';
import { ProjectFormDialog } from '../components/ProjectForm';
import { buildProjectRows, ProjectsTable } from '../components/ProjectsTable';
import { Button, Card, EmptyState, ErrorNote, Loading, PageHeader } from '../components/ui';
import { errorMessage } from '../lib/errors';

export function ProjectsPage() {
  const navigate = useNavigate();
  const projects = useProjects();
  const findings = useFindings();
  const [creating, setCreating] = useState(false);

  const rows = useMemo(
    () => (projects.data && findings.data ? buildProjectRows(projects.data, findings.data) : null),
    [projects.data, findings.data],
  );
  const error = projects.error ?? findings.error;

  return (
    <>
      <PageHeader
        title="プロジェクト"
        description="診断や調査の単位ごとに検出事項をまとめます。"
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            新規プロジェクト
          </Button>
        }
      />
      {error ? <ErrorNote>{errorMessage(error)}</ErrorNote> : null}
      {!rows && !error ? <Loading /> : null}
      {rows ? (
        <Card>
          {rows.length > 0 ? <ProjectsTable rows={rows} /> : <EmptyState title="プロジェクトはまだありません。" />}
        </Card>
      ) : null}
      {creating ? (
        <ProjectFormDialog onClose={() => setCreating(false)} onSaved={(project) => navigate(`/projects/${project.id}`)} />
      ) : null}
    </>
  );
}
