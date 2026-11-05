import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { deleteFinding } from '../api/findings';
import { deleteProject } from '../api/projects';
import { useIsAdmin, useRefreshData } from '../api/queries';
import type { FindingListItem, Project } from '../lib/domain';
import { errorMessage } from '../lib/errors';
import { FindingFormDialog } from './FindingForm';
import { ProjectFormDialog } from './ProjectForm';
import { ConfirmDialog, RowMenu } from './ui';

export function DeleteProjectDialog({
  project,
  findingCount,
  onClose,
  onDeleted,
}: {
  project: Project;
  findingCount: number;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const refresh = useRefreshData();
  const remove = useMutation({
    mutationFn: () => deleteProject(project.id),
    onSuccess: async () => {
      onDeleted?.();
      await refresh();
      onClose();
    },
  });
  return (
    <ConfirmDialog
      title="プロジェクトを削除"
      message={
        <>
          <p className="font-semibold text-ink [overflow-wrap:anywhere]">{project.name}</p>
          <p className="mt-2">
            このプロジェクトと、紐づく検出事項 {findingCount.toLocaleString('ja-JP')} 件をすべて削除します。元に戻せません。
          </p>
        </>
      }
      busy={remove.isPending}
      error={remove.error ? errorMessage(remove.error) : null}
      onConfirm={() => remove.mutate()}
      onClose={onClose}
    />
  );
}

export function DeleteFindingDialog({
  finding,
  onClose,
  onDeleted,
}: {
  finding: Pick<FindingListItem, 'id' | 'ref_id' | 'title'>;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const refresh = useRefreshData();
  const remove = useMutation({
    mutationFn: () => deleteFinding(finding.id),
    onSuccess: async () => {
      onDeleted?.();
      await refresh();
      onClose();
    },
  });
  return (
    <ConfirmDialog
      title="検出事項を削除"
      message={
        <>
          <p className="font-semibold text-ink [overflow-wrap:anywhere]">
            <span className="font-mono">{finding.ref_id}</span> {finding.title}
          </p>
          <p className="mt-2">この検出事項を削除します。元に戻せません。</p>
        </>
      }
      busy={remove.isPending}
      error={remove.error ? errorMessage(remove.error) : null}
      onConfirm={() => remove.mutate()}
      onClose={onClose}
    />
  );
}

export function ProjectRowActions({ project, findingCount }: { project: Project; findingCount: number }) {
  const navigate = useNavigate();
  const isAdmin = useIsAdmin();
  const [dialog, setDialog] = useState<'edit' | 'delete' | null>(null);
  return (
    <>
      <RowMenu
        label={`${project.name} の操作`}
        items={[
          { label: '開く', onSelect: () => navigate(`/projects/${project.id}`) },
          { label: '編集', onSelect: () => setDialog('edit') },
          ...(isAdmin ? [{ label: '削除', danger: true, onSelect: () => setDialog('delete') }] : []),
        ]}
      />
      {dialog === 'edit' ? <ProjectFormDialog project={project} onClose={() => setDialog(null)} /> : null}
      {dialog === 'delete' ? (
        <DeleteProjectDialog project={project} findingCount={findingCount} onClose={() => setDialog(null)} />
      ) : null}
    </>
  );
}

export function FindingRowActions({ finding }: { finding: FindingListItem }) {
  const navigate = useNavigate();
  const isAdmin = useIsAdmin();
  const [dialog, setDialog] = useState<'edit' | 'delete' | null>(null);
  return (
    <>
      <RowMenu
        label={`${finding.ref_id} の操作`}
        items={[
          { label: '開く', onSelect: () => navigate(`/findings/${finding.id}`) },
          { label: '編集', onSelect: () => setDialog('edit') },
          ...(isAdmin ? [{ label: '削除', danger: true, onSelect: () => setDialog('delete') }] : []),
        ]}
      />
      {dialog === 'edit' ? <FindingFormDialog findingId={finding.id} onClose={() => setDialog(null)} /> : null}
      {dialog === 'delete' ? <DeleteFindingDialog finding={finding} onClose={() => setDialog(null)} /> : null}
    </>
  );
}
