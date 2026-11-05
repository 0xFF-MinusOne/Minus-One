import {supabase} from '../lib/supabase';
import {fetchAllPages} from '../api/pagination';
import type {Asset,Service,Technology,Scope,Note,Job,Diff,ReconData} from './model';
import type {Json} from '../lib/database.types';
import type {Severity} from '../lib/domain';
export async function loadRecon(projectId:string):Promise<ReconData>{
 const [assets,services,technologies,scopes,notes,jobs,diffs]=await Promise.all([
  fetchAllPages<Asset>((a,b)=>supabase.from('recon_assets').select('*').eq('project_id',projectId).order('id').range(a,b)),
  fetchAllPages<Service>((a,b)=>supabase.from('recon_services').select('*').eq('project_id',projectId).order('id').range(a,b)),
  fetchAllPages<Technology>((a,b)=>supabase.from('recon_technologies').select('*').eq('project_id',projectId).order('id').range(a,b)),
  fetchAllPages<Scope>((a,b)=>supabase.from('recon_scopes').select('*').eq('project_id',projectId).order('id').range(a,b)),
  fetchAllPages<Note>((a,b)=>supabase.from('recon_notes').select('*').eq('project_id',projectId).order('created_at',{ascending:false}).order('id').range(a,b)),
  fetchAllPages<Job>((a,b)=>supabase.from('recon_jobs').select('*').eq('project_id',projectId).order('created_at',{ascending:false}).order('id').range(a,b)),
  fetchAllPages<Diff>((a,b)=>supabase.from('recon_diffs').select('*').eq('project_id',projectId).order('created_at',{ascending:false}).order('id').range(a,b)),
 ]);return {assets,services,technologies,scopes,notes,jobs,diffs};
}
export async function importAssets(projectId:string,rows:Json[],filename:string){const {error}=await supabase.rpc('import_recon_assets',{p_project_id:projectId,p_rows:rows,p_filename:filename});if(error)throw error}
export async function saveNote(projectId:string,body:string,assetId:string|null){const {error}=await supabase.from('recon_notes').insert({project_id:projectId,body,asset_id:assetId});if(error)throw error}
export async function saveScope(scope:Omit<Scope,'id'|'created_at'>){const {error}=await supabase.from('recon_scopes').upsert(scope,{onConflict:'project_id,kind,value'});if(error)throw error}
export async function promoteNote(noteId:string,title:string,severity:Severity):Promise<string>{const {data,error}=await supabase.rpc('promote_recon_note',{p_note_id:noteId,p_title:title,p_severity:severity});if(error)throw error;return data}
