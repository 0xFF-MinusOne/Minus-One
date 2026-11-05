import type { Database } from '../lib/database.types';
import { supabase } from '../lib/supabase';
import { fetchAllPages } from './pagination';

export type Member = Database['public']['Tables']['members']['Row'];

export function listMembers(): Promise<Member[]> {
  return fetchAllPages<Member>((from, to) =>
    supabase.from('members').select('*').order('created_at').order('user_id').range(from, to),
  );
}

/** 自分の行。非メンバーや無効なメンバーには RLS で見えず null になる。 */
export async function getMembership(userId: string): Promise<Member | null> {
  const { data, error } = await supabase.from('members').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateMember(
  userId: string,
  values: Pick<Partial<Member>, 'role' | 'is_active'>,
): Promise<void> {
  const { error } = await supabase.from('members').update(values).eq('user_id', userId).select().single();
  if (error) throw error;
}
