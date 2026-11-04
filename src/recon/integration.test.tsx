import {readFileSync} from 'node:fs';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {renderToString} from 'react-dom/server';
import {MemoryRouter} from 'react-router-dom';
import {describe,expect,it,vi} from 'vitest';
import {queryKeys} from '../api/queries';
import {ReconApp} from './ReconApp';
import {products} from '../products';
vi.mock('../lib/supabase',()=>({supabase:{},supabaseConfigured:true}));
describe('共通アプリへのRecon統合',()=>{
 it('同じドメインのPentestとReconへ遷移する',()=>{
   expect(products.map(p=>p.url)).toEqual(expect.arrayContaining(['/pentest','/recon']));
   expect(products.every(p=>p.url?.startsWith('/'))).toBe(true);
 });
 it('既存案件キャッシュを使い、日本語の概要とデモ表示を描画できる',()=>{
   const client=new QueryClient();client.setQueryData(queryKeys.projects,[]);
   const html=renderToString(<QueryClientProvider client={client}><MemoryRouter><ReconApp/></MemoryRouter></QueryClientProvider>);
   expect(html).toContain('攻撃対象面の概要');expect(html).toContain('UIプレビュー');
   expect(html).toContain('api.example.com');expect(html).toContain('href="/pentest"');
 });
 it('Reconは既存のログイン・メンバー確認の内側に置く',()=>{
   const source=readFileSync(new URL('../App.tsx',import.meta.url),'utf8');
   const member=source.indexOf('<Route element={<RequireMember />}');
   const recon=source.indexOf('<Route path="recon/*"');
   const end=source.indexOf('</Routes>');
   expect(member).toBeGreaterThan(-1);expect(recon).toBeGreaterThan(member);expect(end).toBeGreaterThan(recon);
 });
});
