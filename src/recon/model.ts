export type Risk='Critical'|'High'|'Medium'|'Low'|'Unknown';
export type AssetStatus='Live'|'Offline'|'Unknown';
export interface Asset {id:string;project_id:string;host:string;type:'Host'|'IP';status:AssetStatus;risk:Risk;tags:string[];dns_records:unknown[];source:string;first_seen_at:string;last_seen_at:string}
export interface Service {id:string;project_id:string;asset_id:string;port:number;transport:'tcp'|'udp';protocol:string;banner:string;tls:string;state:'open'|'closed'|'unknown'}
export interface Technology{id:string;project_id:string;asset_id:string;name:string;version:string;evidence:string}
export interface Scope{id:string;project_id:string;kind:'domain'|'ip'|'cidr';value:string;excluded:boolean;authorization:string;created_at:string}
export interface Note{id:string;project_id:string;body:string;asset_id:string|null;finding_id:string|null;created_at:string;created_by:string|null}
export interface Job{id:string;project_id:string;name:string;target:string;status:'Queued'|'Running'|'Completed'|'Failed';source:string;summary:Record<string,number>;created_at:string;finished_at:string|null}
export interface Diff{id:string;project_id:string;job_id:string;host:string;kind:'added'|'changed'|'service'|'technology';before_data:unknown;after_data:unknown;created_at:string}
export interface ReconData{assets:Asset[];services:Service[];technologies:Technology[];scopes:Scope[];notes:Note[];jobs:Job[];diffs:Diff[]}
export const emptyRecon:ReconData={assets:[],services:[],technologies:[],scopes:[],notes:[],jobs:[],diffs:[]};
type Table<Row,Insert>={Row:{[K in keyof Row]:Row[K]};Insert:{[K in keyof Insert]:Insert[K]};Update:Partial<{[K in keyof Insert]:Insert[K]}>;Relationships:[]};
export type ReconTables={
 recon_assets:Table<Asset,Pick<Asset,'project_id'|'host'|'type'>&Partial<Omit<Asset,'id'|'project_id'|'host'|'type'>>>;
 recon_services:Table<Service,Omit<Service,'id'>>;
 recon_technologies:Table<Technology,Omit<Technology,'id'>>;
 recon_scopes:Table<Scope,Omit<Scope,'id'|'created_at'>>;
 recon_notes:Table<Note,Pick<Note,'project_id'|'body'>&Partial<Pick<Note,'asset_id'>>>;
 recon_jobs:Table<Job,Pick<Job,'project_id'|'name'|'target'|'status'|'source'>>;
 recon_diffs:Table<Diff,Omit<Diff,'id'|'created_at'>>;
};
