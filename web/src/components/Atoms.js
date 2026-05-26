import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from 'react';
import { BAND_COLOR } from '../types';
/** Score with a coloured band indicator. Renders "—" for null. */
export function ScoreCell({ score, band }) {
    if (score == null)
        return _jsx("span", { className: "text-muted dark:text-muted-dark num", children: "\u2014" });
    const b = band ?? null;
    return (_jsxs("span", { className: "inline-flex items-center gap-1.5 num", children: [_jsx("span", { className: "font-medium", children: score.toFixed(1) }), b && _jsx("span", { className: "inline-block w-1.5 h-1.5 rounded-full", style: { background: BAND_COLOR[b] } })] }));
}
/** Percentage with traffic-light tone. */
export function PctCell({ value, low = 70, mid = 85 }) {
    if (value == null)
        return _jsx("span", { className: "text-muted dark:text-muted-dark num", children: "\u2014" });
    const cls = value < low ? 'text-bad' : value < mid ? 'text-avg' : 'text-great';
    return _jsxs("span", { className: `num ${cls}`, children: [value.toFixed(1), "%"] });
}
/** A coloured square — used in heatmaps and inline as a status pill. */
export function BandPill({ score, band, size = 'sm', label }) {
    const dim = size === 'xs' ? 'h-4 w-4 text-[9px]' : size === 'md' ? 'h-7 w-7 text-[11px]' : 'h-5 w-5 text-[10px]';
    const bg = band ? BAND_COLOR[band] : 'transparent';
    return (_jsx("span", { title: label, className: `inline-flex items-center justify-center ${dim} num font-medium border border-line dark:border-line-dark`, style: band ? { background: bg, color: '#fff', borderColor: bg } : undefined, children: score != null ? score.toFixed(score % 1 === 0 ? 0 : 1) : '' }));
}
export function Section({ title, hint, right, children }) {
    return (_jsxs("section", { children: [_jsxs("div", { className: "flex items-baseline justify-between mb-2 gap-3 flex-wrap", children: [_jsxs("h2", { className: "label-xs flex items-center", children: [title, hint] }), right && _jsx("div", { className: "text-[11px] text-muted dark:text-muted-dark", children: right })] }), children] }));
}
export function Empty({ message }) {
    return (_jsx("div", { className: "border hrule text-sm text-muted dark:text-muted-dark py-10 text-center", children: message }));
}
export function useSort(rows, initial) {
    const [sortKey, setSortKey] = useState(initial.key);
    const [sortDir, setSortDir] = useState(initial.dir ?? 'asc');
    const toggle = (key) => {
        if (key === sortKey)
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else {
            setSortKey(key);
            setSortDir(key === initial.key ? (initial.dir ?? 'asc') : 'asc');
        }
    };
    const sorted = useMemo(() => {
        const copy = [...rows];
        copy.sort((a, b) => {
            const va = a[sortKey];
            const vb = b[sortKey];
            if (va == null && vb == null)
                return 0;
            if (va == null)
                return 1;
            if (vb == null)
                return -1;
            if (typeof va === 'number' && typeof vb === 'number')
                return sortDir === 'asc' ? va - vb : vb - va;
            const sa = String(va), sb = String(vb);
            return sortDir === 'asc' ? sa.localeCompare(sb) : sb.localeCompare(sa);
        });
        return copy;
    }, [rows, sortKey, sortDir]);
    return { sorted, sortKey, sortDir, toggle };
}
/** Sortable column header. Pass `sortKey` + `current` + `dir` + `onToggle`. */
export function TH({ children, sortKey, current, dir, onToggle, align = 'left', className = '', sticky = false, }) {
    const isSortable = !!(sortKey && onToggle);
    const isActive = sortKey && current === sortKey;
    const indicator = isActive ? (dir === 'asc' ? ' ▲' : ' ▼') : '';
    const alignCls = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
    return (_jsx("th", { onClick: isSortable ? () => onToggle(sortKey) : undefined, className: `cell-pad th-bold ${alignCls} ${isSortable ? 'th-sortable' : ''} ${sticky ? 'sticky left-0 z-10' : ''} ${className}`, children: _jsxs("span", { className: "inline-flex items-center gap-1", children: [children, isSortable && (_jsx("span", { className: `text-[9px] ${isActive ? 'text-ink dark:text-ink-dark' : 'text-muted dark:text-muted-dark/50'}`, children: isActive ? indicator : ' ⇅' }))] }) }));
}
// ─── Pager ─────────────────────────────────────────────────────────────────
export function usePager(rows, pageSize = 15) {
    const [page, setPage] = useState(0);
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    const safePage = Math.min(page, totalPages - 1);
    const slice = rows.slice(safePage * pageSize, (safePage + 1) * pageSize);
    return { slice, page: safePage, totalPages, setPage, pageSize, total: rows.length };
}
export function Pager({ page, totalPages, setPage, total, pageSize }) {
    if (totalPages <= 1)
        return null;
    const from = page * pageSize + 1;
    const to = Math.min(total, (page + 1) * pageSize);
    return (_jsxs("div", { className: "flex items-center justify-between px-3 py-2 border-t hrule text-[11px]", children: [_jsxs("span", { className: "text-muted dark:text-muted-dark num", children: ["Rows ", from, "\u2013", to, " of ", total] }), _jsxs("span", { className: "inline-flex gap-1", children: [_jsx("button", { className: "btn-ghost disabled:opacity-30", disabled: page === 0, onClick: () => setPage(page - 1), children: "\u2039 PREV" }), _jsxs("span", { className: "px-2 py-1 num text-[11px] text-muted dark:text-muted-dark", children: [page + 1, " / ", totalPages] }), _jsx("button", { className: "btn-ghost disabled:opacity-30", disabled: page >= totalPages - 1, onClick: () => setPage(page + 1), children: "NEXT \u203A" })] })] }));
}
