import type { Project, ProjectInsert } from '../lib/domain';
import { supabase } from '../lib/supabase';
import { fetchAllPages } from './pagination';

export function listProjects(): Promise<Project[]> {
  return fetchAllPages<Project>((from, to) =>
    supabase.from('projects').select('*').order('created_at', { ascending: false }).order('id').range(from, to),
  );
}

export async function createProject(values: ProjectInsert): Promise<Project> {
  const { data, error } = await supabase.from('projects').insert(values).select().single();
  if (error) throw error;
  return data;
}

export async function updateProject(id: string, values: ProjectInsert): Promise<Project> {
  const { data, error } = await supabase.from('projects').update(values).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteProject(id: string): Promise<void> {
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) throw error;
}
