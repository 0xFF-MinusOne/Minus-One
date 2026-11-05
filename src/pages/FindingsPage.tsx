import { useFindings, useProjects } from '../api/queries';
import { FindingsBrowser } from '../components/FindingsBrowser';
import { Card, ErrorNote, Loading, PageHeader } from '../components/ui';
import { errorMessage } from '../lib/errors';

export function FindingsPage() {
  const projects = useProjects();
  const findings = useFindings();
  const error = projects.error ?? findings.error;

  return (
    <>
      <PageHeader title="検出事項" description="すべてのプロジェクトの検出事項を確認できます。" />
      {error ? <ErrorNote>{errorMessage(error)}</ErrorNote> : null}
      {!error && (!projects.data || !findings.data) ? <Loading /> : null}
      {projects.data && findings.data ? (
        <Card>
          <FindingsBrowser findings={findings.data} projects={projects.data} />
        </Card>
      ) : null}
    </>
  );
}
