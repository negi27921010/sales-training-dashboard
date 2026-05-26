import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { buildZmIndex } from '../lib/zm';
const TABS = [
    { id: 'command', label: 'Command Center' },
    { id: 'attendance', label: 'Attendance Intelligence' },
    { id: 'assessment', label: 'Assessment & Competency' },
    { id: 'people', label: 'People' },
    { id: 'capacity', label: 'Capacity & Operations' },
];
export function Shell({ tab, onTab, filters, setFilters, dataset, children, dataSourceMode, }) {
    // Default theme is DARK; users can flip via the toggle.
    const [dark, setDark] = useState(() => (localStorage.getItem('theme') ?? 'dark') === 'dark');
    useEffect(() => {
        document.documentElement.classList.toggle('dark', dark);
        localStorage.setItem('theme', dark ? 'dark' : 'light');
    }, [dark]);
    // Resolve ZM list (zone-aware) — populates the global filter.
    const zmList = dataset ? buildZmIndex(dataset).list : [];
    return (_jsxs("div", { className: "flex flex-col min-h-screen", children: [_jsx("header", { className: "sticky top-0 z-50 backdrop-blur bg-bg/95 dark:bg-bg-dark/95 border-b hrule", children: _jsxs("div", { className: "max-w-screen-2xl mx-auto px-5 py-3 flex items-center gap-6 flex-wrap", children: [_jsxs("div", { className: "flex items-center gap-3 shrink-0", children: [_jsx("span", { className: "text-ink dark:text-ink-dark inline-flex", children: _jsxs("svg", { viewBox: "0 0 32 32", width: "22", height: "22", "aria-hidden": "true", children: [_jsx("rect", { x: "2", y: "20", width: "4", height: "8", fill: "currentColor" }), _jsx("rect", { x: "9", y: "16", width: "4", height: "12", fill: "currentColor" }), _jsx("rect", { x: "16", y: "11", width: "4", height: "17", fill: "currentColor" }), _jsx("rect", { x: "23", y: "6", width: "4", height: "22", fill: "currentColor" }), _jsx("path", { d: "M4 20 L11 16 L18 11 L25 6", stroke: "#0D9488", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", fill: "none" })] }) }), _jsxs("div", { className: "font-semibold tracking-tight text-sm leading-tight", children: ["SALES TRAINING ", _jsx("span", { className: "text-muted dark:text-muted-dark", children: "\u00B7" }), " OPS"] }), _jsx("div", { className: "label-xs", children: dataSourceMode === 'csv' ? 'Source: CSV seed (dev)' : 'Source: Supabase (live)' })] }), _jsx("nav", { className: "flex gap-1 -mb-3", children: TABS.map(t => (_jsx("button", { className: `tab ${tab === t.id ? 'tab-active' : ''}`, onClick: () => onTab(t.id), children: t.label }, t.id))) }), _jsxs("div", { className: "ml-auto flex items-center gap-2 flex-wrap", children: [_jsx(FilterDropdown, { label: "Batch", value: String(filters.batch), options: ['all', '1', '2', '3', '4', '5'], onChange: v => setFilters({ ...filters, batch: v === 'all' ? 'all' : parseInt(v, 10) }) }), _jsx(FilterDropdown, { label: "ZM", value: filters.reportingManager, options: ['all', ...zmList], onChange: v => setFilters({ ...filters, reportingManager: v }) }), _jsx(FilterDropdown, { label: "Role", value: filters.role, options: ['all', 'ZM', 'BDM', 'BDA'], onChange: v => setFilters({ ...filters, role: v }) }), _jsx("button", { className: "btn-ghost", onClick: () => setDark(d => !d), title: "Toggle theme", children: dark ? 'LIGHT' : 'DARK' })] })] }) }), _jsx("main", { className: "flex-1 w-full", children: _jsx("div", { className: "max-w-screen-2xl mx-auto px-5 py-6", children: children }) }), _jsx("footer", { className: "border-t hrule", children: _jsxs("div", { className: "max-w-screen-2xl mx-auto px-5 py-2 text-[10px] text-muted dark:text-muted-dark flex justify-between flex-wrap gap-2", children: [_jsx("span", { children: "Sales Training Operations Intelligence \u00B7 v0.2.0" }), _jsx("span", { children: dataset
                                ? `${dataset.employees.length} employees · ${dataset.sessions.length} sessions · ${dataset.assessments.filter(a => a.score != null).length} assessments`
                                : 'Loading…' })] }) })] }));
}
function FilterDropdown({ label, value, options, onChange, }) {
    return (_jsxs("label", { className: "flex items-center gap-1.5 text-xs", children: [_jsx("span", { className: "label-xs", children: label }), _jsx("select", { value: value, onChange: e => onChange(e.target.value), className: "bg-transparent border hrule px-1.5 py-1 text-xs font-mono outline-none\n                   focus:ring-1 focus:ring-accent max-w-[160px]", children: options.map(o => (_jsx("option", { value: o, children: o === 'all' ? 'All' : o }, o))) })] }));
}
