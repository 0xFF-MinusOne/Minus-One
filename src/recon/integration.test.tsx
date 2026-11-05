import {readFileSync} from 'node:fs';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {renderToString} from 'react-dom/server';
import {MemoryRouter} from 'react-router-dom';
import {describe,expect,it,vi} from 'vitest';
import {emptyRecon} from './model';
import {makeProject} from '../test/factories';
import {queryKeys} from '../api/queries';
import {ReconApp} from './ReconApp';
import {products} from '../products';
vi.mock('../lib/supabase',()=>({supabase:{},supabaseConfigured:true}));
describe('共通アプリへのRecon統合',()=>{
 it('既存実績と新しいGhostwriterの入口を分離する',()=>{
   expect(products.find(p=>p.id==='pentest-dashboard')?.url).toBe('/pentest');
   expect(products.find(p=>p.id==='ghostwriter')?.description).toContain('新しい案件');
   expect(products.some(p=>p.url==='/recon')).toBe(false);
 });
 it('既存案件の空データを表示し、架空の資産を生成しない',()=>{
   const client=new QueryClient();const project=makeProject();client.setQueryData(queryKeys.projects,[project]);client.setQueryData(['recon',project.id],emptyRecon);
   const html=renderToString(<QueryClientProvider client={client}><MemoryRouter><ReconApp/></MemoryRouter></QueryClientProvider>);
   expect(html).toContain('攻撃対象面の概要');expect(html).toContain('結果をインポートすると');
   expect(html).not.toContain('api.example.com');expect(html).toContain('href="/pentest"');
 });
 it('Reconは既存のログイン・メンバー確認の内側に置く',()=>{
   const source=readFileSync(new URL('../App.tsx',import.meta.url),'utf8');
   const member=source.indexOf('<Route element={<RequireMember />}');
   const recon=source.indexOf('<Route path="recon/*"');
   const end=source.indexOf('</Routes>');
   expect(member).toBeGreaterThan(-1);expect(recon).toBeGreaterThan(member);expect(end).toBeGreaterThan(recon);
 });
});
