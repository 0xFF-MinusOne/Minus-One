import { ChevronDown, ExternalLink, FileText, FolderClosed, KeyRound, LayoutDashboard, LogOut, Menu, Plus, ShieldCheck, Users, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { signOutCurrent, useUserEmail } from '../auth/AuthProvider';
import { ghostwriterEntryUrl, ghostwriterOpensInNewTab } from '../products';
import { GlobalSearch } from './GlobalSearch';
import { ProjectFormDialog } from './ProjectForm';
import { Button } from './ui';

const NAV_ITEMS = [
  { to: '/pentest', label: 'ダッシュボード', icon: LayoutDashboard, end: true },
  { to: '/projects', label: 'プロジェクト', icon: FolderClosed, end: false },
  { to: '/findings', label: '検出事項', icon: ShieldCheck, end: false },
  { to: '/members', label: 'メンバー', icon: Users, end: false },
] as const;

/** 別アプリなので NavLink にせず、接続先が未設定ならリンクにしない。 */
function GhostwriterNavItem({ onNavigate }: { onNavigate?: () => void }) {
  const base = 'flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-semibold';
  if (!ghostwriterEntryUrl) {
    return (
      <span className={`${base} text-ink-muted`}>
        <FileText className="h-5 w-5" aria-hidden />
        Ghostwriter
        <span className="ml-auto text-xs font-normal">準備中</span>
      </span>
    );
  }
  return (
    <a
      href={ghostwriterEntryUrl}
      {...(ghostwriterOpensInNewTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      onClick={onNavigate}
      className={`${base} text-ink-soft transition-colors hover:bg-canvas hover:text-ink`}
    >
      <FileText className="h-5 w-5" aria-hidden />
      Ghostwriter
      {ghostwriterOpensInNewTab && (
        <>
          <ExternalLink className="ml-auto h-4 w-4" aria-hidden />
          <span className="sr-only">（新しいタブで開く）</span>
        </>
      )}
    </a>
  );
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col bg-white px-4 py-5">
      <div className="mb-8 flex items-center gap-3 px-2">
        <img src="/brand/pentest-dashboard-icon.png" alt="Pentest Dashboard" width={40} height={40} className="logo-on-white h-10 w-10" />
        <div className="text-[15px] font-extrabold uppercase leading-tight tracking-wide text-ink">
          Pentest
          <br />
          Dashboard
        </div>
      </div>
      <nav aria-label="メインメニュー" className="space-y-1.5">
        <GhostwriterNavItem onNavigate={onNavigate} />
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-semibold transition-colors ${
                isActive ? 'bg-brand-100 text-brand-700' : 'text-ink-soft hover:bg-canvas hover:text-ink'
              }`
            }
          >
            <Icon className="h-5 w-5" aria-hidden />
            {label}
          </NavLink>
        ))}
      </nav>
      <p className="mt-auto px-3 text-xs tracking-wide text-ink-muted">MINUS ONE</p>
    </div>
  );
}

function UserMenu() {
  const email = useUserEmail();
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const logout = async () => {
    setOpen(false);
    await signOutCurrent();
    navigate('/login', { replace: true });
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-lg p-1 hover:bg-canvas"
      >
        <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-100 text-sm font-bold uppercase text-brand-700">
          {email.charAt(0) || '?'}
        </span>
        <span className="hidden max-w-44 truncate text-sm font-semibold lg:block">{email}</span>
        <ChevronDown className="h-4 w-4 text-ink-muted" aria-hidden />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 top-full z-40 mt-1 min-w-44 rounded-lg border border-line bg-white py-1 shadow-pop">
          <p className="truncate px-3.5 py-2 text-xs text-ink-muted lg:hidden">{email}</p>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              navigate('/account/password');
            }}
            className="flex w-full items-center gap-2 whitespace-nowrap px-3.5 py-2 text-left text-sm hover:bg-brand-50"
          >
            <KeyRound className="h-4 w-4" aria-hidden />
            パスワードを変更
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => void logout()}
            className="flex w-full items-center gap-2 whitespace-nowrap px-3.5 py-2 text-left text-sm hover:bg-brand-50"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            ログアウト
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => setDrawerOpen(false), [location.pathname]);

  return (
    <div className="min-h-screen bg-canvas">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 border-r border-line lg:block">
        <Sidebar />
      </aside>

      {drawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="メニューを閉じる"
            className="absolute inset-0 bg-ink/40"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-64 shadow-pop">
            <button
              type="button"
              aria-label="メニューを閉じる"
              className="absolute right-2 top-2 z-10 rounded-md p-1 text-ink-muted"
              onClick={() => setDrawerOpen(false)}
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
            <Sidebar onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      ) : null}

      <div className="lg:pl-60">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-white px-4 py-3 sm:px-6">
          <button
            type="button"
            aria-label="メニューを開く"
            className="rounded-md p-1 text-ink-soft lg:hidden"
            onClick={() => setDrawerOpen(true)}
          >
            <Menu className="h-6 w-6" aria-hidden />
          </button>
          <div className="min-w-0 flex-1">
            <GlobalSearch />
          </div>
          <UserMenu />
          <Button variant="primary" aria-label="新規プロジェクト" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">新規プロジェクト</span>
          </Button>
        </header>
        <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>

      {creating ? (
        <ProjectFormDialog
          onClose={() => setCreating(false)}
          onSaved={(project) => navigate(`/projects/${project.id}`)}
        />
      ) : null}
    </div>
  );
}
