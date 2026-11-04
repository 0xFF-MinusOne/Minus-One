import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToString } from 'react-dom/server';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RequireMember } from '../auth/AuthProvider';
import { ChangePasswordPage } from './ChangePasswordPage';
import { describe, expect, it, vi } from 'vitest';
import { queryKeys } from '../api/queries';
import { makeFinding, makeProject } from '../test/factories';
import { DashboardPage } from './DashboardPage';
import { FindingDetailPage } from './FindingDetailPage';
import { FindingsPage } from './FindingsPage';
import { LoginPage } from './LoginPage';
import { ProjectDetailPage } from './ProjectDetailPage';
import { ProjectsPage } from './ProjectsPage';

vi.mock('../lib/supabase', () => ({ supabase: {}, supabaseConfigured: true }));

const project = makeProject({ name: '架空の診断' });
const finding = makeFinding({
  seq: 7,
  severity: 'critical',
  title: '<img src=x onerror=alert(1)>',
  report_url: 'javascript:alert(1)',
  description: '<b>説明</b>',
});

function render(element: ReactNode, path: string, routePath: string): string {
  const client = new QueryClient();
  client.setQueryData(queryKeys.projects, [project]);
  client.setQueryData(queryKeys.findings, [finding]);
  client.setQueryData(queryKeys.finding(finding.id), finding);
  client.setQueryData(queryKeys.members, []);
  return renderToString(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={routePath} element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('各画面がデータつきで描画できる', () => {
  it('ダッシュボード', () => {
    const html = render(<DashboardPage />, '/', '/');
    expect(html).toContain('進行中のプロジェクト');
    expect(html).toContain('PEN-0007');
    expect(html).toContain('検出事項の内訳');
  });

  it('プロジェクト一覧と詳細', () => {
    expect(render(<ProjectsPage />, '/projects', '/projects')).toContain('架空の診断');
    const detail = render(<ProjectDetailPage />, `/projects/${project.id}`, '/projects/:projectId');
    expect(detail).toContain('Trivy 取り込み');
    expect(detail).toContain('PEN-0007');
  });

  it('検出事項の一覧と詳細は、取り込みデータを HTML にせず危険な URL をリンクにしない', () => {
    const list = render(<FindingsPage />, '/findings', '/findings');
    expect(list).toContain('PEN-0007');
    expect(list).not.toContain('<img src=x');

    const detail = render(<FindingDetailPage />, `/findings/${finding.id}`, '/findings/:findingId');
    expect(detail).toContain('緊急');
    expect(detail).not.toContain('<img src=x');
    expect(detail).not.toContain('<b>説明');
    expect(detail).not.toContain('href="javascript:');
    // 管理者でなければ削除の操作を出さない（DB でも拒否される）。
    expect(detail).not.toContain('削除');
    expect(detail).toContain('手元メモ参照');
  });

  it('ログイン画面に新規登録の導線が無い', () => {
    const html = render(<LoginPage />, '/login', '/login');
    expect(html).toContain('ログイン');
    expect(html).not.toContain('新規登録');
  });

  it('パスワードの変更画面に確認入力がある', () => {
    const html = render(<ChangePasswordPage />, '/account/password', '/account/password');
    expect(html).toContain('新しいパスワード（確認）');
    expect(html).toContain('12 文字以上');
  });
});

describe('初回のパスワード変更', () => {
  function renderGuarded(mustChange: boolean): string {
    const client = new QueryClient();
    client.setQueryData(queryKeys.membership(''), { role: 'member', is_active: true, must_change_password: mustChange });
    return renderToString(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/findings']}>
          <Routes>
            <Route element={<RequireMember />}>
              <Route path="/findings" element={<p>保護された画面</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it('印があれば、どのパスでも変更画面だけを出す', () => {
    const html = renderGuarded(true);
    expect(html).toContain('ほかの画面には進めません');
    expect(html).not.toContain('保護された画面');
  });

  it('印が無ければ先へ進める', () => {
    const html = renderGuarded(false);
    expect(html).toContain('保護された画面');
    expect(html).not.toContain('ほかの画面には進めません');
  });
});
