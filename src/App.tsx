import {lazy, Suspense} from 'react';
import HomePage from './hub/HomePage';
const ReconApp = lazy(()=>import('./recon/ReconApp').then(m=>({default:m.ReconApp})));
import { Link, Route, Routes } from 'react-router-dom';
import { RequireAuth, RequireMember } from './auth/AuthProvider';
import { Layout } from './components/Layout';
import { EmptyState } from './components/ui';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { DashboardPage } from './pages/DashboardPage';
import { FindingDetailPage } from './pages/FindingDetailPage';
import { FindingsPage } from './pages/FindingsPage';
import { LoginPage } from './pages/LoginPage';
import { MembersPage } from './pages/MembersPage';
import { MfaPage } from './pages/MfaPage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { ProjectsPage } from './pages/ProjectsPage';

function NotFound() {
  return (
    <EmptyState title="ページが見つかりません。">
      <Link to="/pentest" className="font-semibold text-brand-700 hover:underline">
        ダッシュボードへ戻る
      </Link>
    </EmptyState>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage/>} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/mfa" element={<MfaPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<RequireMember />}>
          <Route path="recon/*" element={<Suspense fallback={<p>Reconを読み込んでいます…</p>}><ReconApp/></Suspense>} />
          <Route element={<Layout />}>
            <Route path="pentest" element={<DashboardPage />} />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="projects/:projectId" element={<ProjectDetailPage />} />
            <Route path="findings" element={<FindingsPage />} />
            <Route path="findings/:findingId" element={<FindingDetailPage />} />
            <Route path="members" element={<MembersPage />} />
            <Route path="account/password" element={<ChangePasswordPage />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}
