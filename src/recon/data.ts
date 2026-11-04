export type Risk = 'Critical'|'High'|'Medium'|'Low';
export interface Asset {id:string;host:string;type:'Host'|'IP';status:'Live'|'Offline';risk:Risk;lastSeen:string;tags:string[]}
export const assets:Asset[]=[
{id:'a1',host:'api.example.com',type:'Host',status:'Live',risk:'Critical',lastSeen:'2分前',tags:['api','prod']},
{id:'a2',host:'app.example.com',type:'Host',status:'Live',risk:'High',lastSeen:'3分前',tags:['web','prod']},
{id:'a3',host:'dev.example.com',type:'Host',status:'Live',risk:'Medium',lastSeen:'5分前',tags:['dev']},
{id:'a4',host:'10.0.0.12',type:'IP',status:'Live',risk:'Medium',lastSeen:'6分前',tags:['internal']},
{id:'a5',host:'staging.example.com',type:'Host',status:'Live',risk:'Low',lastSeen:'8分前',tags:['staging','web']}];
export const initialJobs=[{name:'full-recon',target:'example.com',status:'Running'},{name:'subdomain-enum',target:'example.com',status:'Completed'},{name:'service-scan',target:'10.0.0.0/24',status:'Completed'},{name:'tech-detect',target:'example.com',status:'Failed'}];
export const technologies=[['nginx',423,'N'],['React',186,'⚛'],['Next.js',97,'N'],['Postgres',64,'P'],['Cloudflare',52,'☁'],['SSH',38,'>_']] as const;
export const initialNotes=[{id:'n1',text:'dev.example.com の管理画面（/admin）を調査する。権限昇格の可能性を検証。',time:'12分前',promoted:false},{id:'n2',text:'staging.example.com は検証環境の可能性。機密情報やデバッグ用エンドポイントの露出を確認。',time:'1時間前',promoted:false}];
export const domains=['api','app','auth','dev','cdn','staging'];
