import { ReactNode, useEffect, useState } from 'react';
import { Filters } from '../state/filters';
import { Dataset } from '../lib/derive';
import { buildZmIndex } from '../lib/zm';

const TABS = [
  { id: 'command',     label: 'Command Center' },
  { id: 'attendance',  label: 'Attendance Intelligence' },
  { id: 'assessment',  label: 'Assessment & Competency' },
  { id: 'people',      label: 'People' },
  { id: 'capacity',    label: 'Capacity & Operations' },
] as const;

export type TabId = typeof TABS[number]['id'];

export function Shell({
  tab, onTab, filters, setFilters, dataset, children, dataSourceMode,
}: {
  tab: TabId;
  onTab: (t: TabId) => void;
  filters: Filters;
  setFilters: (f: Filters) => void;
  dataset: Dataset | null;
  dataSourceMode: string;
  children: ReactNode;
}) {
  // Default theme is DARK; users can flip via the toggle.
  const [dark, setDark] = useState<boolean>(
    () => (localStorage.getItem('theme') ?? 'dark') === 'dark',
  );
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  // Resolve ZM list (zone-aware) — populates the global filter.
  const zmList = dataset ? buildZmIndex(dataset).list : [];

  return (
    <div className="flex flex-col min-h-screen">
      {/* ── Fixed top bar ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 backdrop-blur bg-bg/95 dark:bg-bg-dark/95 border-b hrule">
        <div className="max-w-screen-2xl mx-auto px-5 py-3 flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-ink dark:text-ink-dark inline-flex">
              <svg viewBox="0 0 32 32" width="22" height="22" aria-hidden="true">
                <rect x="2"  y="20" width="4" height="8"  fill="currentColor"/>
                <rect x="9"  y="16" width="4" height="12" fill="currentColor"/>
                <rect x="16" y="11" width="4" height="17" fill="currentColor"/>
                <rect x="23" y="6"  width="4" height="22" fill="currentColor"/>
                <path d="M4 20 L11 16 L18 11 L25 6"
                      stroke="#0D9488" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              </svg>
            </span>
            <div className="font-semibold tracking-tight text-sm leading-tight">
              SALES TRAINING <span className="text-muted dark:text-muted-dark">·</span> OPS
            </div>
            <div className="label-xs">
              {dataSourceMode === 'csv' ? 'Source: CSV seed (dev)' : 'Source: Supabase (live)'}
            </div>
          </div>

          <nav className="flex gap-1 -mb-3">
            {TABS.map(t => (
              <button
                key={t.id}
                className={`tab ${tab === t.id ? 'tab-active' : ''}`}
                onClick={() => onTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2 flex-wrap">
            <FilterDropdown
              label="Batch"
              value={String(filters.batch)}
              options={['all', '1', '2', '3', '4', '5']}
              onChange={v => setFilters({ ...filters, batch: v === 'all' ? 'all' : (parseInt(v, 10) as any) })}
            />
            <FilterDropdown
              label="ZM"
              value={filters.reportingManager}
              options={['all', ...zmList]}
              onChange={v => setFilters({ ...filters, reportingManager: v })}
            />
            <FilterDropdown
              label="Role"
              value={filters.role}
              options={['all', 'ZM', 'BDM', 'BDA']}
              onChange={v => setFilters({ ...filters, role: v as Filters['role'] })}
            />
            <button className="btn-ghost" onClick={() => setDark(d => !d)} title="Toggle theme">
              {dark ? 'LIGHT' : 'DARK'}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full">
        <div className="max-w-screen-2xl mx-auto px-5 py-6">
          {children}
        </div>
      </main>

      <footer className="border-t hrule">
        <div className="max-w-screen-2xl mx-auto px-5 py-2 text-[10px] text-muted dark:text-muted-dark flex justify-between flex-wrap gap-2">
          <span>Sales Training Operations Intelligence · v0.2.0</span>
          <span>
            {dataset
              ? `${dataset.employees.length} employees · ${dataset.sessions.length} sessions · ${dataset.assessments.filter(a => a.score != null).length} assessments`
              : 'Loading…'}
          </span>
        </div>
      </footer>
    </div>
  );
}

function FilterDropdown({
  label, value, options, onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs">
      <span className="label-xs">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="bg-transparent border hrule px-1.5 py-1 text-xs font-mono outline-none
                   focus:ring-1 focus:ring-accent max-w-[160px]"
      >
        {options.map(o => (
          <option key={o} value={o}>{o === 'all' ? 'All' : o}</option>
        ))}
      </select>
    </label>
  );
}
