import { Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFindings, useProjects } from '../api/queries';
import { findingSearchFields, matchesQuery } from '../lib/filter';

const MAX_PROJECTS = 5;
const MAX_FINDINGS = 8;

interface Result {
  key: string;
  to: string;
  group: 'プロジェクト' | '検出事項';
  primary: string;
  secondary: string | null;
  mono?: boolean;
}

export function GlobalSearch() {
  const navigate = useNavigate();
  const projects = useProjects();
  const findings = useFindings();
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, []);

  const results = useMemo<Result[]>(() => {
    if (query.trim() === '') return [];
    const projectResults = (projects.data ?? [])
      .filter((project) => matchesQuery(query, [project.name, project.client, project.target]))
      .slice(0, MAX_PROJECTS)
      .map<Result>((project) => ({
        key: `p-${project.id}`,
        to: `/projects/${project.id}`,
        group: 'プロジェクト',
        primary: project.name,
        secondary: project.client,
      }));
    const findingResults = (findings.data ?? [])
      .filter((finding) => matchesQuery(query, findingSearchFields(finding)))
      .slice(0, MAX_FINDINGS)
      .map<Result>((finding) => ({
        key: `f-${finding.id}`,
        to: `/findings/${finding.id}`,
        group: '検出事項',
        primary: finding.title,
        secondary: finding.ref_id,
        mono: true,
      }));
    return [...projectResults, ...findingResults];
  }, [query, projects.data, findings.data]);

  useEffect(() => setActiveIndex(0), [results]);

  const go = (result: Result) => {
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
    navigate(result.to);
  };

  const onInputKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    } else if (event.key === 'ArrowDown' && results.length > 0) {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % results.length);
    } else if (event.key === 'ArrowUp' && results.length > 0) {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + results.length) % results.length);
    } else if (event.key === 'Enter') {
      const result = results[activeIndex];
      if (result) go(result);
    }
  };

  const showPanel = open && query.trim() !== '';

  return (
    <div ref={rootRef} className="relative w-full max-w-xl">
      <Search className="pointer-events-none absolute left-3 top-2.5 h-[18px] w-[18px] text-ink-muted" aria-hidden />
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={showPanel}
        aria-controls="global-search-results"
        aria-label="プロジェクトと検出事項を検索"
        placeholder="プロジェクト、検出事項、クライアントなどを検索…"
        className="field-control !py-2 !pl-9 sm:!pr-14"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onInputKey}
      />
      <kbd className="pointer-events-none absolute right-2.5 top-2 hidden rounded border border-line px-1.5 py-0.5 text-[11px] text-ink-muted sm:block">
        ⌘K
      </kbd>
      {showPanel ? (
        <ul
          id="global-search-results"
          role="listbox"
          className="absolute left-0 right-0 top-full z-40 mt-1 max-h-96 overflow-y-auto rounded-lg border border-line bg-white py-1 shadow-pop"
        >
          {results.length === 0 ? (
            <li className="px-3 py-3 text-sm text-ink-muted">見つかりませんでした。</li>
          ) : (
            results.map((result, index) => (
              <li key={result.key} role="option" aria-selected={index === activeIndex}>
                <button
                  type="button"
                  onClick={() => go(result)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${index === activeIndex ? 'bg-brand-50' : ''}`}
                >
                  <span className="shrink-0 whitespace-nowrap rounded bg-[#F0F2F6] px-1.5 py-0.5 text-[11px] text-ink-soft">
                    {result.group}
                  </span>
                  {result.mono && result.secondary ? (
                    <span className="shrink-0 font-mono text-xs text-brand-700">{result.secondary}</span>
                  ) : null}
                  <span className="min-w-0 truncate">{result.primary}</span>
                  {!result.mono && result.secondary ? (
                    <span className="ml-auto shrink truncate text-xs text-ink-muted">{result.secondary}</span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
