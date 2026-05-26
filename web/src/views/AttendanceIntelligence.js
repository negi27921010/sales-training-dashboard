import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useState } from 'react';
import { TOTAL_TRAINING_SESSIONS } from '../types';
import { InfoTip } from '../components/Tooltip';
import { Empty, PctCell, Section, TH, useSort } from '../components/Atoms';
import { upsertAction, removeAction, retrainingId, useActions, } from '../lib/actions';
import { buildDefaulterIntel } from '../lib/intelligence';
import { buildZmIndex, zmFor } from '../lib/zm';
export function AttendanceIntelligence({ ds, onPickEmployee }) {
    const actions = useActions();
    const zmIdx = useMemo(() => buildZmIndex(ds), [ds]);
    const intel = useMemo(() => buildDefaulterIntel(ds, actions), [ds, actions]);
    // Inject resolved ZM into each intel row so it's filterable/sortable
    const intelWithZm = useMemo(() => intel.map(i => {
        const emp = ds.employees.find(e => e.email === i.email);
        return { ...i, zm: emp ? zmFor(emp, zmIdx) : 'Unassigned' };
    }), [intel, ds, zmIdx]);
    return (_jsxs("div", { className: "flex flex-col gap-6", children: [_jsx(KPIs, { ds: ds, intel: intel }), _jsx(RetrainingIntelligence, { intel: intelWithZm, zmIdx: zmIdx, onPickEmployee: onPickEmployee }), _jsx(AttendanceHeatmap, { ds: ds, zmIdx: zmIdx, onPickEmployee: onPickEmployee })] }));
}
// ─── KPI cards top ─────────────────────────────────────────────────────────
function KPIs({ ds, intel }) {
    const stats = useMemo(() => {
        const all = ds.attendance.filter(a => a.sessionNumber <= TOTAL_TRAINING_SESSIONS && (a.status === 'present' || a.status === 'absent'));
        const present = all.filter(a => a.status === 'present').length;
        const absent = all.filter(a => a.status === 'absent').length;
        const pct = all.length === 0 ? 0 : Math.round((present / all.length) * 1000) / 10;
        const chronic = intel.filter(i => i.riskLabel === 'CHRONIC').length;
        const atRisk = intel.filter(i => i.riskLabel === 'AT RISK').length;
        const unscheduled = intel.reduce((s, x) => s + x.totalUnscheduled, 0);
        return { all: all.length, present, absent, pct, chronic, atRisk, unscheduled };
    }, [ds, intel]);
    const cards = [
        { label: 'Overall Attendance', value: `${stats.pct.toFixed(1)}%`, sub: `${stats.present} of ${stats.all} cells = YES`,
            tone: stats.pct < 70 ? 'bad' : stats.pct < 85 ? 'avg' : 'great',
            tip: 'YES marks ÷ (YES + NO) across every employee × every held session.' },
        { label: 'Total Absences', value: `${stats.absent}`, sub: `${intel.length} unique employees affected`,
            tone: stats.absent > 0 ? 'bad' : 'great',
            tip: 'Every cell marked NO in the attendance sheet for sessions held so far.' },
        { label: 'Unscheduled Retraining', value: `${stats.unscheduled}`, sub: 'absences with no make-up plan',
            tone: stats.unscheduled > 0 ? 'bad' : 'great',
            tip: 'Absences where no retraining slot has been assigned. Each is an action item.' },
        { label: 'Chronic Defaulters', value: `${stats.chronic}`, sub: `${stats.atRisk} more at-risk`,
            tone: stats.chronic > 0 ? 'bad' : stats.atRisk > 0 ? 'avg' : 'great',
            tip: 'CHRONIC = 2+ no-shows after rescheduling, or risk score ≥ 200.' },
    ];
    return (_jsx("section", { className: "grid grid-cols-1 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x hrule border-y hrule", children: cards.map(c => (_jsxs("div", { className: "px-4 py-4 flex flex-col gap-1", children: [_jsxs("div", { className: "label-xs flex items-center", children: [c.label, _jsx(InfoTip, { children: c.tip })] }), _jsxs("div", { className: "flex items-baseline gap-2", children: [_jsx("div", { className: "num text-3xl font-semibold", children: c.value }), _jsx("span", { className: `inline-block w-1.5 h-1.5 rounded-full
              ${c.tone === 'bad' ? 'bg-bad' : c.tone === 'avg' ? 'bg-avg' : 'bg-great'}` })] }), _jsx("div", { className: "text-[11px] text-muted dark:text-muted-dark", children: c.sub })] }, c.label))) }));
}
function RetrainingIntelligence({ intel, zmIdx, onPickEmployee }) {
    const [expanded, setExpanded] = useState(new Set());
    const [riskFilter, setRiskFilter] = useState('all');
    const [zmFilter, setZmFilter] = useState('all');
    const filtered = useMemo(() => intel.filter(d => {
        if (riskFilter !== 'all' && d.riskLabel !== riskFilter)
            return false;
        if (zmFilter !== 'all' && d.zm !== zmFilter)
            return false;
        return true;
    }), [intel, riskFilter, zmFilter]);
    const { sorted, sortKey, sortDir, toggle: toggleSort } = useSort(filtered, { key: 'riskScore', dir: 'desc' });
    const toggle = (k) => {
        const next = new Set(expanded);
        next.has(k) ? next.delete(k) : next.add(k);
        setExpanded(next);
    };
    if (intel.length === 0) {
        return _jsx(Section, { title: "Retraining Tracker", children: _jsx(Empty, { message: "No absences. Nothing to reschedule." }) });
    }
    return (_jsx(Section, { title: "Retraining Tracker", hint: _jsxs(InfoTip, { children: ["One row per ", _jsx("b", { children: "person" }), ". Click to see every session they missed and either assign them to a future batch running the same session, or mark whether they showed up. Action history persists locally."] }), right: _jsxs("span", { className: "inline-flex items-center gap-3 flex-wrap", children: [_jsx(FilterChip, { label: "Risk", value: riskFilter, options: ['all', 'CHRONIC', 'AT RISK', 'WATCH'], onChange: v => setRiskFilter(v) }), _jsx(FilterChip, { label: "ZM", value: zmFilter, options: ['all', ...zmIdx.list], onChange: setZmFilter }), _jsxs("span", { className: "num", children: [filtered.length, " / ", intel.length] })] }), children: _jsx("div", { className: "border hrule", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx(TH, { align: "center", className: "w-[3%]", children: " " }), _jsx(TH, { sortKey: "name", current: sortKey, dir: sortDir, onToggle: toggleSort, className: "w-[24%]", children: "Employee" }), _jsx(TH, { sortKey: "batch", current: sortKey, dir: sortDir, onToggle: toggleSort, align: "right", className: "w-[7%]", children: "Batch" }), _jsx(TH, { sortKey: "totalMissed", current: sortKey, dir: sortDir, onToggle: toggleSort, align: "right", className: "w-[8%]", children: "Missed" }), _jsx(TH, { sortKey: "totalUnscheduled", current: sortKey, dir: sortDir, onToggle: toggleSort, align: "right", className: "w-[12%]", children: "Unscheduled" }), _jsx(TH, { sortKey: "totalDefaulted", current: sortKey, dir: sortDir, onToggle: toggleSort, align: "right", className: "w-[10%]", children: "No-Shows" }), _jsx(TH, { sortKey: "riskLabel", current: sortKey, dir: sortDir, onToggle: toggleSort, className: "w-[12%]", children: "Risk" }), _jsx(TH, { sortKey: "zm", current: sortKey, dir: sortDir, onToggle: toggleSort, children: "ZM" })] }) }), _jsxs("tbody", { children: [sorted.length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: 8, className: "cell-pad text-center text-muted dark:text-muted-dark py-6", children: "No defaulters match the current filters." }) })), sorted.map(d => (_jsx(DefaulterRow, { d: d, isOpen: expanded.has(d.email), onToggle: () => toggle(d.email), onPickEmployee: onPickEmployee }, d.email)))] })] }) }) }));
}
function FilterChip({ label, value, options, onChange }) {
    return (_jsxs("label", { className: "inline-flex items-center gap-1.5 text-[11px]", children: [_jsx("span", { className: "label-xs", children: label }), _jsx("select", { value: value, onChange: e => onChange(e.target.value), className: "bg-transparent border hrule px-1.5 py-1 text-[11px] font-mono outline-none focus:ring-1 focus:ring-accent max-w-[160px]", children: options.map(o => _jsx("option", { value: o, children: o === 'all' ? 'All' : o }, o)) })] }));
}
function DefaulterRow({ d, isOpen, onToggle, onPickEmployee }) {
    const riskCls = d.riskLabel === 'CHRONIC' ? 'bg-bad text-bg dark:text-bg-dark'
        : d.riskLabel === 'AT RISK' ? 'bg-bad/10 text-bad border border-bad/40'
            : d.riskLabel === 'WATCH' ? 'bg-avg/10 text-avg border border-avg/40'
                : 'bg-great/10 text-great border border-great/40';
    return (_jsxs(_Fragment, { children: [_jsxs("tr", { onClick: onToggle, className: `border-b hrule cursor-pointer ${isOpen ? 'bg-ink/[0.04] dark:bg-ink-dark/[0.07]' : 'hover:bg-ink/[0.02] dark:hover:bg-ink-dark/[0.04]'}`, children: [_jsx("td", { className: "cell-pad text-center text-muted dark:text-muted-dark", children: isOpen ? '▾' : '▸' }), _jsxs("td", { className: "cell-pad", children: [_jsx("button", { onClick: (e) => { e.stopPropagation(); onPickEmployee(d.email); }, className: "font-medium hover:underline text-left", children: d.name }), _jsxs("div", { className: "text-[11px] text-muted dark:text-muted-dark num", children: [d.email, " \u00B7 ", d.area] })] }), _jsx("td", { className: "cell-pad text-right num", children: d.batch }), _jsx("td", { className: "cell-pad text-right num font-semibold text-bad", children: d.totalMissed }), _jsx("td", { className: "cell-pad text-right num", children: d.totalUnscheduled > 0 ? _jsx("span", { className: "text-bad", children: d.totalUnscheduled }) : _jsx("span", { className: "text-muted dark:text-muted-dark", children: "0" }) }), _jsx("td", { className: "cell-pad text-right num", children: d.totalDefaulted > 0 ? _jsx("span", { className: "text-bad font-semibold", children: d.totalDefaulted }) : _jsx("span", { className: "text-muted dark:text-muted-dark", children: "0" }) }), _jsx("td", { className: "cell-pad", children: _jsx("span", { className: `inline-block px-2 py-0.5 text-[10px] uppercase tracking-wider font-semibold ${riskCls}`, children: d.riskLabel }) }), _jsx("td", { className: "cell-pad text-[12px] text-muted dark:text-muted-dark", children: d.zm.startsWith('Unassigned') ? _jsx("span", { className: "italic", children: d.zm }) : d.zm })] }), isOpen && (_jsx("tr", { children: _jsx("td", { colSpan: 8, className: "p-4 bg-line/30 dark:bg-line-dark/20", children: _jsx(MissedSessionsPanel, { d: d }) }) }))] }));
}
function MissedSessionsPanel({ d }) {
    if (d.missed.length === 0)
        return _jsx(Empty, { message: "No missed sessions." });
    return (_jsx("div", { className: "border hrule bg-bg dark:bg-bg-dark", children: _jsxs("table", { className: "w-full text-[13px]", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx(TH, { className: "w-[14%]", children: "Session" }), _jsx(TH, { children: "Topic" }), _jsx(TH, { className: "w-[14%]", children: "Originally on" }), _jsx(TH, { className: "w-[42%]", children: "Make-up Action" })] }) }), _jsx("tbody", { children: d.missed.map(m => _jsx(MissedRow, { d: d, m: m }, m.sessionNumber)) })] }) }));
}
function MissedRow({ d, m }) {
    const today = new Date().toISOString().slice(0, 10);
    const action = m.action;
    const overdue = action && action.status === 'pending' && action.assignedDate < today;
    return (_jsxs("tr", { className: "border-b hrule last:border-b-0 align-top", children: [_jsx("td", { className: "cell-pad font-medium", children: m.sessionCode }), _jsx("td", { className: "cell-pad text-[12px] leading-tight", children: m.topic }), _jsx("td", { className: "cell-pad text-[12px] num text-muted dark:text-muted-dark", children: m.homeBatchDate ?? '—' }), _jsx("td", { className: "cell-pad", children: action == null ? _jsx(ScheduleControl, { d: d, m: m }) : _jsx(AssignedControl, { d: d, m: m, action: action, overdue: !!overdue }) })] }));
}
function ScheduleControl({ d, m }) {
    const [picking, setPicking] = useState(false);
    if (m.reassignmentOptions.length === 0) {
        return _jsx("span", { className: "text-[12px] text-muted dark:text-muted-dark italic", children: "No upcoming batches have this session \u2014 escalate to ZM." });
    }
    if (!picking) {
        return (_jsx("button", { className: "text-[11px] px-2 py-1 border border-accent text-accent hover:bg-accent hover:text-bg dark:hover:text-bg-dark transition-colors", onClick: () => setPicking(true), children: "+ Assign to make-up batch" }));
    }
    return (_jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsx("span", { className: "text-[11px] text-muted dark:text-muted-dark", children: "Pick a future batch:" }), m.reassignmentOptions.map(opt => (_jsxs("button", { className: "text-[11px] num px-2 py-1 border border-line dark:border-line-dark hover:bg-accent hover:text-bg hover:border-accent", onClick: () => {
                    upsertAction({
                        kind: 'retraining', id: retrainingId(d.email, m.sessionNumber),
                        email: d.email, sessionNumber: m.sessionNumber,
                        originalBatch: d.batch, assignedBatch: opt.batch, assignedDate: opt.date,
                        status: 'pending', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
                    });
                    setPicking(false);
                }, children: ["B", opt.batch, " \u00B7 ", opt.date, opt.trainer ? ` · ${opt.trainer}` : ''] }, opt.batch + opt.date))), _jsx("button", { className: "text-[11px] text-muted hover:text-ink dark:hover:text-ink-dark", onClick: () => setPicking(false), children: "cancel" })] }));
}
function AssignedControl({ d, m, action, overdue }) {
    const stateCls = action.status === 'attended' ? 'bg-great/10 text-great border-great/30'
        : action.status === 'no_show' ? 'bg-bad/10 text-bad border-bad/30'
            : overdue ? 'bg-bad/10 text-bad border-bad/30'
                : 'bg-avg/10 text-avg border-avg/30';
    const stateLabel = action.status === 'attended' ? 'ATTENDED'
        : action.status === 'no_show' ? 'NO-SHOW'
            : overdue ? 'OVERDUE' : 'PENDING';
    return (_jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsx("span", { className: `inline-block px-2 py-0.5 border text-[10px] uppercase tracking-wider font-medium ${stateCls}`, children: stateLabel }), _jsxs("span", { className: "text-[12px] num", children: ["\u2192 Batch ", action.assignedBatch, " on ", action.assignedDate] }), action.status === 'pending' && overdue && (_jsxs(_Fragment, { children: [_jsx("button", { className: "text-[11px] px-2 py-1 border border-great text-great hover:bg-great hover:text-bg", onClick: () => upsertAction({ ...action, status: 'attended', updatedAt: new Date().toISOString() }), children: "Mark attended" }), _jsx("button", { className: "text-[11px] px-2 py-1 border border-bad text-bad hover:bg-bad hover:text-bg", onClick: () => upsertAction({ ...action, status: 'no_show', updatedAt: new Date().toISOString() }), children: "Mark no-show" })] })), _jsx("button", { className: "text-[11px] text-muted hover:text-ink dark:hover:text-ink-dark underline", onClick: () => removeAction('retraining', retrainingId(d.email, m.sessionNumber)), children: "clear" })] }));
}
// ─── Heatmap ───────────────────────────────────────────────────────────────
function AttendanceHeatmap({ ds, zmIdx, onPickEmployee }) {
    const [sortBy, setSortBy] = useState('batch');
    const rows = useMemo(() => {
        const list = ds.employees.map(e => {
            const cells = Array.from({ length: TOTAL_TRAINING_SESSIONS }, (_, i) => {
                const a = ds.attendance.find(x => x.email === e.email && x.sessionNumber === i + 1);
                return (a?.status ?? null);
            });
            const held = cells.filter(c => c === 'present' || c === 'absent').length;
            const present = cells.filter(c => c === 'present').length;
            const pct = held === 0 ? null : Math.round((present / held) * 1000) / 10;
            const zm = zmFor(e, zmIdx);
            return { emp: e, cells, pct, missed: cells.filter(c => c === 'absent').length, zm };
        });
        return list.sort((a, b) => {
            if (sortBy === 'name')
                return a.emp.name.localeCompare(b.emp.name);
            if (sortBy === 'pct')
                return (a.pct ?? -1) - (b.pct ?? -1);
            return a.emp.batch - b.emp.batch || a.emp.name.localeCompare(b.emp.name);
        });
    }, [ds, sortBy, zmIdx]);
    if (rows.length === 0)
        return _jsx(Empty, { message: "No employees in current filter." });
    return (_jsx(Section, { title: "Attendance Heatmap", hint: _jsx(InfoTip, { children: "Every employee \u00D7 every session. Scroll inside the box; column header stays stuck so you don't lose context." }), right: _jsxs("span", { className: "inline-flex items-center gap-2 flex-wrap", children: [_jsxs("span", { children: [rows.length, " employees \u00D7 ", TOTAL_TRAINING_SESSIONS, " sessions"] }), _jsx(SortToggle, { value: sortBy, onChange: setSortBy })] }), children: _jsx("div", { className: "border hrule table-scroll", style: { maxHeight: 520 }, children: _jsxs("table", { className: "w-full text-[12px]", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx(TH, { sticky: true, className: "w-[20%] bg-bg dark:bg-bg-dark", children: "Employee" }), _jsx(TH, { className: "w-[5%]", children: "Batch" }), _jsx(TH, { className: "w-[10%]", children: "Area" }), _jsx(TH, { className: "w-[12%]", children: "ZM" }), Array.from({ length: TOTAL_TRAINING_SESSIONS }, (_, i) => (_jsx(TH, { align: "center", children: i + 1 }, i))), _jsx(TH, { align: "right", className: "w-[7%]", children: "Att%" }), _jsx(TH, { align: "right", className: "w-[6%]", children: "Missed" })] }) }), _jsx("tbody", { children: rows.map(r => (_jsxs("tr", { className: "border-b hrule last:border-b-0 hover:bg-ink/[0.02] dark:hover:bg-ink-dark/[0.04]", children: [_jsxs("td", { className: "cell-pad sticky left-0 bg-bg dark:bg-bg-dark", children: [_jsx("button", { onClick: () => onPickEmployee(r.emp.email), className: "font-medium hover:underline text-left", children: r.emp.name }), r.emp.role === 'Exit' && _jsx("span", { className: "ml-2 text-[9px] uppercase border border-bad/40 text-bad px-1", children: "exit" })] }), _jsx("td", { className: "cell-pad num", children: r.emp.batch }), _jsx("td", { className: "cell-pad text-muted dark:text-muted-dark", children: r.emp.area }), _jsx("td", { className: "cell-pad text-[11px] text-muted dark:text-muted-dark", children: r.zm.startsWith('Unassigned') ? _jsx("span", { className: "italic", children: "\u2014" }) : r.zm }), r.cells.map((c, i) => (_jsx("td", { className: "px-1 py-1.5 text-center", children: _jsx(AttCell, { status: c, sessionNumber: i + 1 }) }, i))), _jsx("td", { className: "cell-pad text-right", children: _jsx(PctCell, { value: r.pct }) }), _jsx("td", { className: "cell-pad text-right num", children: r.missed > 0 ? _jsx("span", { className: "text-bad", children: r.missed }) : _jsx("span", { className: "text-muted dark:text-muted-dark", children: "0" }) })] }, r.emp.email))) })] }) }) }));
}
function AttCell({ status, sessionNumber }) {
    const map = {
        present: { cls: 'bg-great', label: 'present' },
        absent: { cls: 'bg-bad', label: 'absent' },
        rescheduled: { cls: 'bg-accent', label: 'rescheduled' },
        excused: { cls: 'bg-muted', label: 'excused' },
    };
    const m = status ? map[status] : null;
    return (_jsx("span", { title: `Session ${sessionNumber} — ${m?.label ?? 'not held yet'}`, className: `inline-block h-3.5 w-3.5 ${m?.cls ?? 'border border-line dark:border-line-dark'}` }));
}
function SortToggle({ value, onChange }) {
    const opts = [
        { id: 'batch', label: 'Batch' },
        { id: 'name', label: 'A–Z' },
        { id: 'pct', label: 'Lowest %' },
    ];
    return (_jsx("span", { className: "inline-flex border hrule", children: opts.map(o => (_jsx("button", { onClick: () => onChange(o.id), className: `px-2 py-1 text-[11px] uppercase tracking-wider font-medium
            ${value === o.id ? 'bg-ink text-bg dark:bg-ink-dark dark:text-bg-dark' : 'hover:bg-ink/[0.04] dark:hover:bg-ink-dark/[0.04]'}`, children: o.label }, o.id))) }));
}
