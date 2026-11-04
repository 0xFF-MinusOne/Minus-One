import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { updateMember, type Member } from '../api/members';
import { useIsAdmin, useMembers, useRefreshData } from '../api/queries';
import { useUserEmail } from '../auth/AuthProvider';
import { Button, Card, ConfirmDialog, ErrorNote, Loading, PageHeader } from '../components/ui';
import { errorMessage } from '../lib/errors';
import { formatDate } from '../lib/format';

const ROLE_LABELS: Record<Member['role'], string> = { admin: '管理者', member: 'メンバー' };

export function MembersPage() {
  const members = useMembers();
  const isAdmin = useIsAdmin();
  const myEmail = useUserEmail();
  const refresh = useRefreshData();
  const [deactivating, setDeactivating] = useState<Member | null>(null);

  const change = useMutation({
    mutationFn: ({ member, values }: { member: Member; values: Pick<Partial<Member>, 'role' | 'is_active'> }) =>
      updateMember(member.user_id, values),
    onSuccess: async () => {
      setDeactivating(null);
      await refresh();
    },
  });

  return (
    <>
      <PageHeader
        title="メンバー"
        description="メンバーの追加、2 段階認証のリセットは管理者がスクリプトで行います（README を参照）。"
      />
      {members.error ? <ErrorNote>{errorMessage(members.error)}</ErrorNote> : null}
      {members.isPending ? <Loading /> : null}
      {change.error && !deactivating ? (
        <div className="mb-4">
          <ErrorNote>{errorMessage(change.error)}</ErrorNote>
        </div>
      ) : null}
      {members.data ? (
        <Card>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>メールアドレス</th>
                  <th>権限</th>
                  <th>状態</th>
                  <th>追加日</th>
                  {isAdmin ? <th aria-label="操作" /> : null}
                </tr>
              </thead>
              <tbody>
                {members.data.map((member) => (
                  <tr key={member.user_id}>
                    <td>
                      <div className="cell-text font-mono">
                        {member.email}
                        {member.email === myEmail ? <span className="ml-2 font-sans text-xs text-ink-muted">（自分）</span> : null}
                      </div>
                    </td>
                    <td>
                      {isAdmin ? (
                        <select
                          aria-label={`${member.email} の権限`}
                          className="field-control !w-auto"
                          value={member.role}
                          disabled={change.isPending}
                          onChange={(event) =>
                            change.mutate({ member, values: { role: event.target.value as Member['role'] } })
                          }
                        >
                          <option value="admin">{ROLE_LABELS.admin}</option>
                          <option value="member">{ROLE_LABELS.member}</option>
                        </select>
                      ) : (
                        ROLE_LABELS[member.role]
                      )}
                    </td>
                    <td className="whitespace-nowrap">{member.is_active ? '有効' : '無効'}</td>
                    <td className="whitespace-nowrap tabular-nums text-ink-soft">{formatDate(member.created_at)}</td>
                    {isAdmin ? (
                      <td className="text-right">
                        {member.is_active ? (
                          <Button onClick={() => setDeactivating(member)}>無効にする</Button>
                        ) : (
                          <Button onClick={() => change.mutate({ member, values: { is_active: true } })}>
                            有効にする
                          </Button>
                        )}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
      {deactivating ? (
        <ConfirmDialog
          title="メンバーを無効にする"
          message={
            <p className="[overflow-wrap:anywhere]">
              {deactivating.email} はデータを読み書きできなくなります。ログイン自体も止めるには、README のスクリプトで無効化してください。
            </p>
          }
          confirmLabel="無効にする"
          busy={change.isPending}
          error={change.error ? errorMessage(change.error) : null}
          onConfirm={() => change.mutate({ member: deactivating, values: { is_active: false } })}
          onClose={() => {
            setDeactivating(null);
            change.reset();
          }}
        />
      ) : null}
    </>
  );
}
