import { ReactNode, useMemo, useState } from 'react';
import { BAND_COLOR, Band } from '../types';

/** Score with a coloured band indicator. Renders "—" for null. */
export function ScoreCell({ score, band }: { score: number | null | undefined; band?: Band | null }) {
  if (score == null) return <span className="text-muted dark:text-muted-dark num">—</span>;
  const b = band ?? null;
  return (
    <span className="inline-flex items-center gap-1.5 num">
      <span className="font-medium">{score.toFixed(1)}</span>
      {b && <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: BAND_COLOR[b] }} />}
    </span>
  );
}

/** Percentage with traffic-light tone. */
export function PctCell({ value, low = 70, mid = 85 }: { value: number | null; low?: number; mid?: number }) {
  if (value == null) return <span className="text-muted dark:text-muted-dark num">—</span>;
  const cls = value < low ? 'text-bad' : value < mid ? 'text-avg' : 'text-great';
  return <span className={`num ${cls}`}>{value.toFixed(1)}%</span>;
}

/** A coloured square — used in heatmaps and inline as a status pill. */
export function BandPill({ score, band, size = 'sm', label }: {
  score?: number | null;
  band?: Band | null;
  size?: 'xs' | 'sm' | 'md';
  label?: string;
}) {
  const dim = size === 'xs' ? 'h-4 w-4 text-[9px]' : size === 'md' ? 'h-7 w-7 text-[11px]' : 'h-5 w-5 text-[10px]';
  const bg = band ? BAND_COLOR[band] : 'transparent';
  return (
    <span
      title={label}
      className={`inline-flex items-center justify-center ${dim} num font-medium border border-line dark:border-line-dark`}
      style={band ? { background: bg, color: '#fff', borderColor: bg } : undefined}
    >
      {score != null ? score.toFixed(score % 1 === 0 ? 0 : 1) : ''}
    </span>
  );
}

export function Section({ title, hint, right, children }: {
  title: ReactNode;
  hint?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between mb-2 gap-3 flex-wrap">
        <h2 className="label-xs flex items-center">
          {title}
          {hint}
        </h2>
        {right && <div className="text-[11px] text-muted dark:text-muted-dark">{right}</div>}
      </div>
      {children}
    </section>
  );
}

export function Empty({ message }: { message: string }) {
  return (
    <div className="border hrule text-sm text-muted dark:text-muted-dark py-10 text-center">
      {message}
    </div>
  );
}

// ─── Sort hook + sortable header ───────────────────────────────────────────
export type SortDir = 'asc' | 'desc';

export function useSort<T extends Record<string, any>>(
  rows: T[],
  initial: { key: keyof T & string; dir?: SortDir },
) {
  const [sortKey, setSortKey] = useState<string>(initial.key);
  const [sortDir, setSortDir] = useState<SortDir>(initial.dir ?? 'asc');
  const toggle = (key: string) => {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === initial.key ? (initial.dir ?? 'asc') : 'asc'); }
  };
  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const va = (a as any)[sortKey];
      const vb = (b as any)[sortKey];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return sortDir === 'asc' ? va - vb : vb - va;
      const sa = String(va), sb = String(vb);
      return sortDir === 'asc' ? sa.localeCompare(sb) : sb.localeCompare(sa);
    });
    return copy;
  }, [rows, sortKey, sortDir]);
  return { sorted, sortKey, sortDir, toggle };
}

/** Sortable column header. Pass `sortKey` + `current` + `dir` + `onToggle`. */
export function TH({
  children, sortKey, current, dir, onToggle, align = 'left', className = '', sticky = false,
}: {
  children: ReactNode;
  sortKey?: string;
  current?: string;
  dir?: SortDir;
  onToggle?: (key: string) => void;
  align?: 'left' | 'right' | 'center';
  className?: string;
  sticky?: boolean;
}) {
  const isSortable = !!(sortKey && onToggle);
  const isActive = sortKey && current === sortKey;
  const indicator = isActive ? (dir === 'asc' ? ' ▲' : ' ▼') : '';
  const alignCls = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
  return (
    <th
      onClick={isSortable ? () => onToggle!(sortKey!) : undefined}
      className={`cell-pad th-bold ${alignCls} ${isSortable ? 'th-sortable' : ''} ${sticky ? 'sticky left-0 z-10' : ''} ${className}`}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {isSortable && (
          <span className={`text-[9px] ${isActive ? 'text-ink dark:text-ink-dark' : 'text-muted dark:text-muted-dark/50'}`}>
            {isActive ? indicator : ' ⇅'}
          </span>
        )}
      </span>
    </th>
  );
}

// ─── Pager ─────────────────────────────────────────────────────────────────
export function usePager<T>(rows: T[], pageSize = 15) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const slice = rows.slice(safePage * pageSize, (safePage + 1) * pageSize);
  return { slice, page: safePage, totalPages, setPage, pageSize, total: rows.length };
}

export function Pager({ page, totalPages, setPage, total, pageSize }: {
  page: number; totalPages: number; setPage: (p: number) => void; total: number; pageSize: number;
}) {
  if (totalPages <= 1) return null;
  const from = page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  return (
    <div className="flex items-center justify-between px-3 py-2 border-t hrule text-[11px]">
      <span className="text-muted dark:text-muted-dark num">Rows {from}–{to} of {total}</span>
      <span className="inline-flex gap-1">
        <button className="btn-ghost disabled:opacity-30" disabled={page === 0} onClick={() => setPage(page - 1)}>‹ PREV</button>
        <span className="px-2 py-1 num text-[11px] text-muted dark:text-muted-dark">{page + 1} / {totalPages}</span>
        <button className="btn-ghost disabled:opacity-30" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>NEXT ›</button>
      </span>
    </div>
  );
}
