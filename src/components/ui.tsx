import { AlertCircle, ArrowDown, ArrowUp, ChevronsUpDown, Loader2, MoreHorizontal, X } from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import type { SortState } from '../lib/filter';
import {
  FINDING_STATUS_LABELS,
  PROJECT_STATUS_LABELS,
  REPORT_STATUS_LABELS,
  SEVERITY_COLORS,
  SEVERITY_LABELS,
  VERIFICATION_LABELS,
  type FindingStatus,
  type ProjectStatus,
  type ReportStatus,
  type Severity,
  type VerificationStatus,
} from '../lib/domain';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700',
  secondary: 'border border-line bg-white text-ink hover:bg-canvas',
  danger: 'bg-[#C92A45] text-white hover:bg-[#AD2239]',
  ghost: 'text-ink-soft hover:bg-brand-50',
};

export function Button({
  variant = 'secondary',
  className = '',
  type = 'button',
  loading = false,
  disabled,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; loading?: boolean }) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${BUTTON_STYLES[variant]} ${className}`}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}

export function Card({
  title,
  action,
  className = '',
  children,
}: {
  title?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`rounded-xl border border-line bg-white p-5 shadow-card ${className}`}>
      {title ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-ink">{title}</h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="break-words text-2xl font-bold text-ink [word-break:keep-all] [overflow-wrap:anywhere]">
          {title}
        </h1>
        {description ? <p className="mt-1 text-sm text-ink-soft">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line px-4 py-10 text-center">
      <p className="text-sm font-semibold text-ink-soft">{title}</p>
      {children ? <div className="mt-3 text-sm text-ink-muted">{children}</div> : null}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="flex items-start gap-2 rounded-lg bg-[#FDEEF0] px-3 py-2 text-sm text-[#8F1C30]">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

export function Loading() {
  return (
    <p className="flex items-center gap-2 py-8 text-sm text-ink-muted">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      読み込み中…
    </p>
  );
}

// ---- バッジ ------------------------------------------------------------------

function Pill({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${className}`}
    >
      {children}
    </span>
  );
}

const SEVERITY_BG: Record<Severity, string> = {
  critical: 'bg-[#FDEEF0] text-[#8F1C30]',
  high: 'bg-[#FEF1E6] text-[#8A4308]',
  medium: 'bg-[#FBF7D9] text-[#655A00]',
  low: 'bg-brand-50 text-brand-700',
  info: 'bg-[#F0F2F6] text-ink-soft',
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <Pill className={SEVERITY_BG[severity]}>
      <span className="h-2 w-2 rounded-full" style={{ background: SEVERITY_COLORS[severity] }} aria-hidden />
      {SEVERITY_LABELS[severity]}
    </Pill>
  );
}

const STATUS_BG: Record<FindingStatus, string> = {
  open: 'bg-[#FDEEF0] text-[#8F1C30]',
  in_progress: 'bg-brand-50 text-brand-700',
  fix_verifying: 'bg-[#E8F7EE] text-[#17663B]',
  resolved: 'bg-[#E8F7EE] text-[#17663B]',
  risk_accepted: 'bg-[#F4EFFC] text-[#5B3A99]',
  false_positive: 'bg-[#F0F2F6] text-ink-soft',
};

export function StatusBadge({ status }: { status: FindingStatus }) {
  return <Pill className={STATUS_BG[status]}>{FINDING_STATUS_LABELS[status]}</Pill>;
}

export function VerificationBadge({ status }: { status: VerificationStatus }) {
  const style =
    status === 'reproduced'
      ? 'bg-[#E8F7EE] text-[#17663B]'
      : status === 'code_confirmed'
        ? 'bg-brand-50 text-brand-700'
        : 'bg-[#F0F2F6] text-ink-soft';
  return <Pill className={style}>{VERIFICATION_LABELS[status]}</Pill>;
}

export function ReportBadge({ status }: { status: ReportStatus }) {
  const style =
    status === 'not_reported' || status === 'not_applicable'
      ? 'bg-[#F0F2F6] text-ink-soft'
      : status === 'fixed' || status === 'disclosed'
        ? 'bg-[#E8F7EE] text-[#17663B]'
        : 'bg-brand-50 text-brand-700';
  return <Pill className={style}>{REPORT_STATUS_LABELS[status]}</Pill>;
}

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const style =
    status === 'completed'
      ? 'bg-[#E8F7EE] text-[#17663B]'
      : status === 'active'
        ? 'bg-brand-50 text-brand-700'
        : 'bg-[#F0F2F6] text-ink-soft';
  return <Pill className={style}>{PROJECT_STATUS_LABELS[status]}</Pill>;
}

export function ProgressCell({ completed, percent }: { completed: boolean; percent: number | null }) {
  if (completed) return <Pill className="bg-[#E8F7EE] text-[#17663B]">完了</Pill>;
  if (percent === null) return <span className="text-ink-muted">—</span>;
  return (
    <div className="w-28">
      <div className="mb-1 text-xs text-ink-soft">{percent}%</div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-line-soft"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="進捗"
      >
        <div className="h-full rounded-full bg-brand-600" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

// ---- 表 ---------------------------------------------------------------------

export function SortHeader<K extends string>({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: K;
  sort: SortState<K>;
  onSort: (key: K) => void;
}) {
  const active = sort.key === sortKey;
  const Icon = !active ? ChevronsUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 font-semibold hover:text-ink"
      >
        {label}
        <Icon className={`h-3.5 w-3.5 ${active ? 'text-brand-600' : 'text-ink-muted'}`} aria-hidden />
      </button>
    </th>
  );
}

export function useSort<K extends string>(initial: SortState<K>) {
  const [sort, setSort] = useState<SortState<K>>(initial);
  const toggle = (key: K) =>
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' },
    );
  return [sort, toggle] as const;
}

export function Pagination({
  page,
  pageCount,
  total,
  onPage,
}: {
  page: number;
  pageCount: number;
  total: number;
  onPage: (page: number) => void;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-ink-soft">
      <span>{total.toLocaleString('ja-JP')} 件</span>
      {pageCount > 1 ? (
        <div className="flex items-center gap-2">
          <Button disabled={page <= 1} onClick={() => onPage(page - 1)}>
            前へ
          </Button>
          <span>
            {page} / {pageCount}
          </span>
          <Button disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
            次へ
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// ---- ダイアログ ---------------------------------------------------------------

/** ネイティブの dialog を使う。フォーカスの閉じ込めと Esc はブラウザに任せる。 */
export function Modal({
  title,
  onClose,
  wide = false,
  children,
}: {
  title: string;
  onClose: () => void;
  wide?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return createPortal(
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className={`m-auto max-h-[90vh] w-[calc(100vw-2rem)] overflow-y-auto rounded-xl bg-white p-0 text-ink shadow-pop ${wide ? 'max-w-3xl' : 'max-w-md'}`}
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-white px-5 py-3.5">
        <h2 className="text-base font-bold">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="閉じる"
          className="rounded-md p-1 text-ink-muted hover:bg-brand-50"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>
      <div className="px-5 py-4">{children}</div>
    </dialog>,
    document.body,
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = '削除する',
  busy,
  error,
  onConfirm,
  onClose,
}: {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  busy: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-4 text-sm text-ink-soft">
        <div>{message}</div>
        {error ? <ErrorNote>{error}</ErrorNote> : null}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} disabled={busy}>
            キャンセル
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** 表の「…」メニュー。横スクロールする表の中で切れないよう body 直下に出す。 */
export function RowMenu({
  label,
  items,
}: {
  label: string;
  items: ReadonlyArray<{ label: string; danger?: boolean; onSelect: () => void }>;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => {
    if (!position) return;
    const close = () => setPosition(null);
    const onPointerDown = (event: PointerEvent) => {
      const node = event.target as Node;
      if (!menuRef.current?.contains(node) && !buttonRef.current?.contains(node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
        buttonRef.current?.focus();
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    menuRef.current?.querySelector('button')?.focus();
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [position]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={position !== null}
        onClick={() => {
          if (position) {
            setPosition(null);
            return;
          }
          const rect = buttonRef.current?.getBoundingClientRect();
          if (rect) setPosition({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
        }}
        className="rounded-md p-1 text-ink-muted hover:bg-brand-50"
      >
        <MoreHorizontal className="h-5 w-5" aria-hidden />
      </button>
      {position
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              style={{ position: 'fixed', top: position.top, right: position.right }}
              className="z-50 min-w-32 rounded-lg border border-line bg-white py-1 shadow-pop"
            >
              {items.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setPosition(null);
                    item.onSelect();
                  }}
                  className={`block w-full whitespace-nowrap px-3.5 py-2 text-left text-sm hover:bg-brand-50 ${item.danger ? 'text-[#AD2239]' : 'text-ink'}`}
                >
                  {item.label}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

// ---- フォーム -----------------------------------------------------------------

export function Field({
  label,
  required,
  hint,
  className = '',
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-semibold text-ink-soft">
        {label}
        {required ? <span className="ml-1 text-[#AD2239]">必須</span> : null}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-ink-muted">{hint}</span> : null}
    </label>
  );
}
