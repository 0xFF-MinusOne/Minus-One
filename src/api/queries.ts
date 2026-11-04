import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { getFinding, listFindings } from './findings';
import { getMembership, listMembers } from './members';
import { listProjects } from './projects';

export const queryKeys = {
  projects: ['projects'] as const,
  findings: ['findings'] as const,
  finding: (id: string) => ['finding', id] as const,
  members: ['members'] as const,
  membership: (userId: string) => ['membership', userId] as const,
};

export function useProjects() {
  return useQuery({ queryKey: queryKeys.projects, queryFn: listProjects });
}

export function useFindings() {
  return useQuery({ queryKey: queryKeys.findings, queryFn: listFindings });
}

export function useFinding(id: string) {
  return useQuery({ queryKey: queryKeys.finding(id), queryFn: () => getFinding(id) });
}

export function useMembers() {
  return useQuery({ queryKey: queryKeys.members, queryFn: listMembers });
}

export function useMembership() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  return useQuery({
    queryKey: queryKeys.membership(userId),
    queryFn: () => getMembership(userId),
    enabled: userId !== '',
  });
}

/** 画面の出し分け用。実際の制限は DB の RLS が行う。 */
export function useIsAdmin(): boolean {
  const membership = useMembership();
  return membership.data?.role === 'admin' && membership.data.is_active;
}

/** user_id からメールアドレスを引く。作成者・更新者の表示に使う。 */
export function useMemberEmail(): (userId: string | null) => string {
  const members = useMembers();
  return (userId) => members.data?.find((member) => member.user_id === userId)?.email ?? '—';
}

/** 書き込みの後に、一覧と詳細をすべて読み直す。 */
export function useRefreshData() {
  const client = useQueryClient();
  return useCallback(async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: queryKeys.projects }),
      client.invalidateQueries({ queryKey: queryKeys.findings }),
      client.invalidateQueries({ queryKey: ['finding'] }),
      client.invalidateQueries({ queryKey: queryKeys.members }),
      client.invalidateQueries({ queryKey: ['membership'] }),
    ]);
  }, [client]);
}
