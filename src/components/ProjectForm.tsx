import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { createProject, updateProject } from '../api/projects';
import { useRefreshData } from '../api/queries';
import {
  PROJECT_KINDS,
  PROJECT_KIND_LABELS,
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  type Project,
  type ProjectInsert,
  type ProjectKind,
  type ProjectStatus,
} from '../lib/domain';
import { errorMessage } from '../lib/errors';
import { emptyToNull } from '../lib/format';
import { Button, ErrorNote, Field, Modal } from './ui';

export function ProjectFormDialog({
  project,
  onClose,
  onSaved,
}: {
  project?: Project;
  onClose: () => void;
  onSaved?: (project: Project) => void;
}) {
  const refresh = useRefreshData();
  const [name, setName] = useState(project?.name ?? '');
  const [client, setClient] = useState(project?.client ?? '');
  const [target, setTarget] = useState(project?.target ?? '');
  const [kind, setKind] = useState<ProjectKind>(project?.kind ?? 'client_engagement');
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? 'planning');
  const [startDate, setStartDate] = useState(project?.start_date ?? '');
  const [endDate, setEndDate] = useState(project?.end_date ?? '');
  const [notes, setNotes] = useState(project?.notes ?? '');
  const [validation, setValidation] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (values: ProjectInsert) =>
      project ? updateProject(project.id, values) : createProject(values),
    onSuccess: async (saved) => {
      await refresh();
      onSaved?.(saved);
      onClose();
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() === '') return setValidation('名前を入力してください。');
    if (startDate && endDate && endDate < startDate) {
      return setValidation('終了日は開始日以降にしてください。');
    }
    setValidation(null);
    save.mutate({
      name: name.trim(),
      client: emptyToNull(client),
      target: emptyToNull(target),
      kind,
      status,
      start_date: startDate || null,
      end_date: endDate || null,
      notes: emptyToNull(notes),
    });
  };

  return (
    <Modal title={project ? 'プロジェクトを編集' : '新規プロジェクト'} onClose={onClose} wide>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field label="名前" required className="sm:col-span-2">
          <input className="field-control" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="クライアント">
          <input className="field-control" value={client} maxLength={200} onChange={(e) => setClient(e.target.value)} />
        </Field>
        <Field label="対象" hint="URL やリポジトリ">
          <input className="field-control font-mono" value={target} maxLength={2000} onChange={(e) => setTarget(e.target.value)} />
        </Field>
        <Field label="種別">
          <select className="field-control" value={kind} onChange={(e) => setKind(e.target.value as ProjectKind)}>
            {PROJECT_KINDS.map((value) => (
              <option key={value} value={value}>
                {PROJECT_KIND_LABELS[value]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="ステータス">
          <select className="field-control" value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
            {PROJECT_STATUSES.map((value) => (
              <option key={value} value={value}>
                {PROJECT_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="開始日">
          <input type="date" className="field-control" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <Field label="終了日">
          <input type="date" className="field-control" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </Field>
        <Field label="メモ" className="sm:col-span-2">
          <textarea className="field-control min-h-24" value={notes} maxLength={20000} onChange={(e) => setNotes(e.target.value)} />
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
    </Modal>
  );
}
