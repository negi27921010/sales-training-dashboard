import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Fragment, useMemo, useState } from 'react';
import { Line, LineChart, CartesianGrid, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, PolarAngleAxis, PolarGrid, Radar, RadarChart, } from 'recharts';
import { competencyAggregate } from '../lib/derive';
import { BAND_COLOR, BAND_LABEL, COMPETENCIES, bandOf } from '../types';
import { InfoTip } from '../components/Tooltip';
import { BandPill, Empty, Section, TH, useSort } from '../components/Atoms';
import { buildReAssessmentIntel, buildScoreTrend, findUngradedSessions, } from '../lib/intelligence';
import { reassessmentId, upsertAction, useActions } from '../lib/actions';
import { buildZmIndex, zmFor } from '../lib/zm';
export function AssessmentCompetency({ ds, onPickEmployee }) {
    const [filters, setFilters] = useState({ zm: 'all', employee: 'all', trainer: 'all' });
    const actions = useActions();
    const zmIdx = useMemo(() => buildZmIndex(ds), [ds]);
    // Filtered dataset: subset of employees + assessments matching filters.
    const filteredDs = useMemo(() => {
        const trainerEmails = new Set();
        if (filters.trainer !== 'all') {
            const trainerSessions = new Set(ds.batchSessions
                .filter(b => b.trainerName === filters.trainer && b.status === 'completed')
                .map(b => `${b.sessionNumber}-${b.batch}`));
            for (const a of ds.attendance) {
                if (a.status !== 'present')
                    continue;
                if (trainerSessions.has(`${a.sessionNumber}-${a.batch}`))
                    trainerEmails.add(a.email);
            }
        }
        const emps = ds.employees.filter(e => {
            if (filters.zm !== 'all' && zmFor(e, zmIdx) !== filters.zm)
                return false;
            if (filters.employee !== 'all' && e.email !== filters.employee)
                return false;
            if (filters.trainer !== 'all' && !trainerEmails.has(e.email))
                return false;
            return true;
        });
        const emails = new Set(emps.map(e => e.email));
        return {
            ...ds,
            employees: emps,
            assessments: ds.assessments.filter(a => emails.has(a.email)),
            attendance: ds.attendance.filter(a => emails.has(a.email)),
        };
    }, [ds, filters, zmIdx]);
    const ungraded = useMemo(() => findUngradedSessions(filteredDs), [filteredDs]);
    const intel = useMemo(() => buildReAssessmentIntel(filteredDs, actions), [filteredDs, actions]);
    const focusedEmail = filters.employee !== 'all' ? filters.employee : null;
    return (_jsxs("div", { className: "flex flex-col gap-6", children: [_jsx(FilterBar, { ds: ds, zmIdx: zmIdx, filters: filters, setFilters: setFilters }), _jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-6", children: [_jsx(CompetencyRadar, { ds: filteredDs, focusedEmail: focusedEmail }), _jsx(CompetencyBreakdown, { ds: filteredDs, focusedEmail: focusedEmail })] }), focusedEmail && _jsx(ScoreTrend, { ds: ds, email: focusedEmail }), _jsx(UngradedSessions, { slots: ungraded }), _jsx(ReAssessmentQueue, { intel: intel, zmIdx: zmIdx, onPickEmployee: onPickEmployee }), _jsx(EmployeeGrid, { ds: filteredDs, zmIdx: zmIdx, onPickEmployee: onPickEmployee, setFilters: setFilters })] }));
}
// ─── Filter Bar ────────────────────────────────────────────────────────────
function FilterBar({ ds, zmIdx, filters, setFilters }) {
    const trainers = useMemo(() => Array.from(new Set(ds.batchSessions.map(b => b.trainerName).filter(Boolean))).sort(), [ds]);
    const [empQ, setEmpQ] = useState('');
    const empMatches = useMemo(() => {
        const t = empQ.trim().toLowerCase();
        if (!t)
            return [];
        return ds.employees
            .filter(e => e.name.toLowerCase().includes(t) || e.email.toLowerCase().includes(t))
            .slice(0, 8);
    }, [ds, empQ]);
    const selectedEmp = filters.employee !== 'all'
        ? ds.employees.find(e => e.email === filters.employee) ?? null
        : null;
    return (_jsx(Section, { title: "Filters", hint: _jsx(InfoTip, { children: "Three independent filters. Combine to scope every section below. Selecting an Employee also unlocks the Score Trend chart." }), children: _jsxs("div", { className: "border hrule p-3 grid grid-cols-1 md:grid-cols-3 gap-3", children: [_jsxs("div", { children: [_jsx("div", { className: "label-xs mb-1", children: "ZM" }), _jsxs("select", { className: "w-full bg-transparent border hrule px-2 py-2 text-sm outline-none font-mono focus:ring-1 focus:ring-accent", value: filters.zm, onChange: e => setFilters({ ...filters, zm: e.target.value }), children: [_jsx("option", { value: "all", children: "All ZMs" }), zmIdx.list.map(z => _jsx("option", { value: z, children: z }, z))] })] }), _jsxs("div", { children: [_jsx("div", { className: "label-xs mb-1", children: "Employee" }), selectedEmp ? (_jsxs("div", { className: "border hrule px-3 py-2 flex items-center justify-between", children: [_jsxs("div", { children: [_jsx("div", { className: "font-medium text-sm", children: selectedEmp.name }), _jsx("div", { className: "text-[11px] text-muted dark:text-muted-dark num", children: selectedEmp.email })] }), _jsx("button", { className: "btn-ghost", onClick: () => setFilters({ ...filters, employee: 'all' }), children: "CLEAR" })] })) : (_jsxs(_Fragment, { children: [_jsx("input", { type: "text", value: empQ, onChange: e => setEmpQ(e.target.value), placeholder: "Search name or email\u2026", className: "w-full bg-transparent border hrule px-2 py-2 text-sm outline-none focus:ring-1 focus:ring-accent" }), empQ && empMatches.length > 0 && (_jsx("div", { className: "mt-1 border hrule divide-y hrule max-h-40 overflow-auto", children: empMatches.map(m => (_jsxs("button", { onClick: () => { setFilters({ ...filters, employee: m.email }); setEmpQ(''); }, className: "w-full text-left px-3 py-2 text-[12px] hover:bg-ink/[0.04] dark:hover:bg-ink-dark/[0.05]", children: [_jsx("div", { className: "font-medium", children: m.name }), _jsxs("div", { className: "text-[10px] text-muted dark:text-muted-dark num", children: [m.email, " \u00B7 B", m.batch] })] }, m.email))) }))] }))] }), _jsxs("div", { children: [_jsx("div", { className: "label-xs mb-1", children: "Trainer" }), _jsxs("select", { className: "w-full bg-transparent border hrule px-2 py-2 text-sm outline-none font-mono focus:ring-1 focus:ring-accent", value: filters.trainer, onChange: e => setFilters({ ...filters, trainer: e.target.value }), children: [_jsx("option", { value: "all", children: "All trainers" }), trainers.map(t => _jsx("option", { value: t, children: t }, t))] })] })] }) }));
}
// ─── Radar (now at top) ────────────────────────────────────────────────────
function CompetencyRadar({ ds, focusedEmail }) {
    const data = useMemo(() => {
        if (focusedEmail) {
            return COMPETENCIES.map(c => {
                const rows = ds.assessments.filter(a => a.email === focusedEmail && a.competency === c && a.score != null);
                const avg = rows.length === 0 ? null
                    : Math.round((rows.reduce((s, r) => s + r.score, 0) / rows.length) * 10) / 10;
                return { competency: c, score: avg ?? 0, assessed: rows.length };
            });
        }
        return competencyAggregate(ds).map(c => ({
            competency: c.competency, score: c.avg ?? 0, assessed: c.assessed,
        }));
    }, [ds, focusedEmail]);
    return (_jsx(Section, { title: focusedEmail ? 'Competency Radar — Selected Person' : 'Competency Radar — Org', hint: _jsx(InfoTip, { children: "10 axes, one per competency. Larger shape = stronger across the board." }), children: _jsx("div", { className: "border hrule p-4 h-96 bg-bg dark:bg-bg-dark", children: _jsx(ResponsiveContainer, { width: "100%", height: "100%", children: _jsxs(RadarChart, { outerRadius: "82%", data: data, children: [_jsx(PolarGrid, { stroke: "currentColor", strokeOpacity: 0.15 }), _jsx(PolarAngleAxis, { dataKey: "competency", tick: { fontSize: 11, fill: 'currentColor' } }), _jsx(Radar, { dataKey: "score", stroke: "#0D9488", fill: "#0D9488", fillOpacity: 0.28 }), _jsx(RTooltip, { contentStyle: { fontSize: 12, background: 'rgba(10,10,10,0.92)', color: '#fff', border: 'none' }, formatter: (v, _n, ctx) => [`${v} / 10 · ${ctx.payload.assessed} assessed`, ctx.payload.competency] })] }) }) }) }));
}
// ─── Score Trend (single person) ───────────────────────────────────────────
function ScoreTrend({ ds, email }) {
    const trend = useMemo(() => buildScoreTrend(ds, email), [ds, email]);
    const data = trend.map(p => ({
        session: p.sessionCode.replace('Deep Dive ', 'DD').replace('Basics ', 'B'),
        score: p.avgScore ?? null,
    }));
    return (_jsx(Section, { title: "Score Trend", hint: _jsx(InfoTip, { children: "Average score per session for the selected employee. Gaps = \"not assessed yet.\"" }), children: _jsx("div", { className: "border hrule p-3 h-64 bg-bg dark:bg-bg-dark", children: _jsx(ResponsiveContainer, { width: "100%", height: "100%", children: _jsxs(LineChart, { data: data, children: [_jsx(CartesianGrid, { strokeDasharray: "3 3", stroke: "currentColor", strokeOpacity: 0.08 }), _jsx(XAxis, { dataKey: "session", tick: { fontSize: 10 }, stroke: "currentColor", strokeOpacity: 0.4 }), _jsx(YAxis, { domain: [0, 10], tick: { fontSize: 10 }, stroke: "currentColor", strokeOpacity: 0.4 }), _jsx(RTooltip, { contentStyle: { fontSize: 12, background: 'rgba(10,10,10,0.92)', color: '#fff', border: 'none' } }), _jsx(Line, { type: "monotone", dataKey: "score", stroke: "#0D9488", strokeWidth: 2, dot: { r: 4 }, connectNulls: true })] }) }) }) }));
}
// ─── Breakdown ─────────────────────────────────────────────────────────────
function CompetencyBreakdown({ ds, focusedEmail }) {
    const rows = useMemo(() => {
        return COMPETENCIES.map(c => {
            const all = ds.assessments.filter(a => a.competency === c
                && a.score != null
                && (!focusedEmail || a.email === focusedEmail));
            const total = all.length;
            const dist = { weak: 0, ok: 0, good: 0, great: 0, excellent: 0 };
            for (const a of all) {
                const b = bandOf(a.score);
                if (b)
                    dist[b]++;
            }
            const avg = total === 0 ? null
                : Math.round((all.reduce((s, x) => s + x.score, 0) / total) * 10) / 10;
            return { competency: c, avg, total, dist };
        }).sort((a, b) => (a.avg ?? 11) - (b.avg ?? 11));
    }, [ds, focusedEmail]);
    return (_jsx(Section, { title: "Competency Breakdown", hint: _jsxs(InfoTip, { children: ["Sorted lowest-avg first. 5-segment bar: ", _jsx("span", { className: "text-bad", children: "Weak" }), " \u00B7", _jsx("span", { className: "text-avg", children: " OK" }), " \u00B7 Good \u00B7 Great \u00B7 Excellent."] }), children: _jsx("div", { className: "border hrule", children: _jsxs("table", { className: "w-full text-[13px]", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx(TH, { children: "Competency" }), _jsx(TH, { align: "right", className: "w-[10%]", children: "Avg" }), _jsx(TH, { className: "w-[45%]", children: "Distribution" }), _jsx(TH, { align: "right", className: "w-[10%]", children: "N" })] }) }), _jsx("tbody", { children: rows.map(r => (_jsxs("tr", { className: "border-b hrule last:border-b-0", children: [_jsx("td", { className: "cell-pad font-medium", children: r.competency }), _jsx("td", { className: "cell-pad text-right num", children: r.avg == null ? _jsx("span", { className: "text-muted dark:text-muted-dark", children: "\u2014" })
                                        : _jsx("span", { style: { color: BAND_COLOR[bandOf(r.avg)] }, children: r.avg.toFixed(1) }) }), _jsx("td", { className: "cell-pad", children: r.total === 0 ? _jsx("span", { className: "text-muted dark:text-muted-dark text-[11px]", children: "no data" })
                                        : _jsx(DistroBar, { dist: r.dist, total: r.total }) }), _jsx("td", { className: "cell-pad text-right num text-muted dark:text-muted-dark", children: r.total })] }, r.competency))) })] }) }) }));
}
function DistroBar({ dist, total }) {
    const pct = (n) => total === 0 ? 0 : (n / total) * 100;
    return (_jsxs("div", { className: "flex h-3 w-full", children: [_jsx("div", { className: "bg-weak", title: `Weak: ${dist.weak}`, style: { width: `${pct(dist.weak)}%` } }), _jsx("div", { className: "bg-ok", title: `OK: ${dist.ok}`, style: { width: `${pct(dist.ok)}%` } }), _jsx("div", { className: "bg-good", title: `Good: ${dist.good}`, style: { width: `${pct(dist.good)}%` } }), _jsx("div", { className: "bg-great", title: `Great: ${dist.great}`, style: { width: `${pct(dist.great)}%` } }), _jsx("div", { className: "bg-excellent", title: `Excellent: ${dist.excellent}`, style: { width: `${pct(dist.excellent)}%` } })] }));
}
// ─── Ungraded sessions ────────────────────────────────────────────────────
function UngradedSessions({ slots }) {
    if (slots.length === 0)
        return null;
    return (_jsx(Section, { title: "Action: trainers haven't scored these sessions yet", hint: _jsx(InfoTip, { children: "Sessions where less than half of attendees were assessed. The trainer should be nudged to grade." }), right: `${slots.length} session(s)`, children: _jsx("div", { className: "border border-bad/40 bg-bad/[0.04]", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx(TH, { children: "Session \u00B7 Batch" }), _jsx(TH, { className: "w-[15%]", children: "Trainer" }), _jsx(TH, { className: "w-[12%]", children: "Date" }), _jsx(TH, { align: "right", className: "w-[18%]", children: "Attended \u2192 Scored" }), _jsx(TH, { className: "w-[18%]", children: "Gap" })] }) }), _jsx("tbody", { children: slots.map((s, i) => {
                            const gap = s.attendedCount - s.assessedCount;
                            return (_jsxs("tr", { className: "border-b hrule last:border-b-0", children: [_jsxs("td", { className: "cell-pad font-medium", children: [s.sessionCode, " \u00B7 Batch ", s.batch] }), _jsx("td", { className: "cell-pad num", children: s.trainer ?? _jsx("span", { className: "italic text-muted dark:text-muted-dark", children: "none" }) }), _jsx("td", { className: "cell-pad num text-muted dark:text-muted-dark", children: s.date ?? '—' }), _jsxs("td", { className: "cell-pad text-right num", children: [_jsx("span", { className: "font-semibold", children: s.attendedCount }), _jsx("span", { className: "text-muted dark:text-muted-dark", children: " attended" }), ' → ', _jsx("span", { className: "font-semibold", children: s.assessedCount }), _jsx("span", { className: "text-muted dark:text-muted-dark", children: " scored" })] }), _jsx("td", { className: "cell-pad", children: _jsxs("span", { className: "inline-block px-2 py-0.5 text-[11px] uppercase tracking-wider font-medium bg-bad/10 text-bad border border-bad/40", children: [gap, " employees ungraded"] }) })] }, i));
                        }) })] }) }) }));
}
// ─── Re-Assessment Queue ──────────────────────────────────────────────────
function ReAssessmentQueue({ intel, zmIdx, onPickEmployee }) {
    const [expanded, setExpanded] = useState(new Set());
    const actions = useActions();
    const enriched = useMemo(() => intel.map(p => {
        // re-resolve via the existing zmIdx + employee email
        void zmIdx;
        return { ...p, weakCount: p.weakCompetencies.length };
    }), [intel, zmIdx]);
    const { sorted, sortKey, sortDir, toggle: toggleSort } = useSort(enriched, { key: 'weakCount', dir: 'desc' });
    const toggle = (k) => {
        const next = new Set(expanded);
        next.has(k) ? next.delete(k) : next.add(k);
        setExpanded(next);
    };
    if (intel.length === 0) {
        return _jsx(Section, { title: "Re-Assessment Queue", hint: _jsx(InfoTip, { children: "Active employees with Weak (0\u20132) scores. None right now." }), children: _jsx(Empty, { message: "No re-assessment cases." }) });
    }
    return (_jsx(Section, { title: "Re-Assessment Queue", hint: _jsx(InfoTip, { children: "One row per employee with any Weak score. Click to schedule per-competency re-assessments." }), right: _jsxs("span", { className: "num", children: [intel.length, " employees"] }), children: _jsx("div", { className: "border hrule", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx(TH, { align: "center", className: "w-[3%]", children: " " }), _jsx(TH, { sortKey: "name", current: sortKey, dir: sortDir, onToggle: toggleSort, className: "w-[24%]", children: "Employee" }), _jsx(TH, { sortKey: "batch", current: sortKey, dir: sortDir, onToggle: toggleSort, align: "right", className: "w-[7%]", children: "Batch" }), _jsx(TH, { className: "w-[18%]", children: "Worst Competency" }), _jsx(TH, { align: "right", className: "w-[8%]", children: "Score" }), _jsx(TH, { sortKey: "weakCount", current: sortKey, dir: sortDir, onToggle: toggleSort, align: "right", className: "w-[10%]", children: "Weak Count" }), _jsx(TH, { className: "w-[14%]", children: "Status" }), _jsx(TH, { children: "ZM" })] }) }), _jsx("tbody", { children: sorted.map(p => (_jsx(ReQueueRow, { p: p, actions: actions, isOpen: expanded.has(p.email), onToggle: () => toggle(p.email), onPickEmployee: onPickEmployee }, p.email))) })] }) }) }));
}
function ReQueueRow({ p, actions, isOpen, onToggle, onPickEmployee }) {
    const pending = p.weakCompetencies.length - p.scheduledCount - p.completedCount;
    const statusCls = pending > 0 ? 'bg-bad/10 text-bad border border-bad/40'
        : p.completedCount === p.weakCompetencies.length ? 'bg-great/10 text-great border border-great/40'
            : 'bg-avg/10 text-avg border border-avg/40';
    const statusLabel = pending > 0 ? `${pending} TO SCHEDULE`
        : p.completedCount === p.weakCompetencies.length ? 'CLOSED'
            : `${p.scheduledCount} SCHEDULED`;
    return (_jsxs(_Fragment, { children: [_jsxs("tr", { onClick: onToggle, className: `border-b hrule cursor-pointer ${isOpen ? 'bg-ink/[0.04] dark:bg-ink-dark/[0.07]' : 'hover:bg-ink/[0.02] dark:hover:bg-ink-dark/[0.04]'}`, children: [_jsx("td", { className: "cell-pad text-center text-muted dark:text-muted-dark", children: isOpen ? '▾' : '▸' }), _jsxs("td", { className: "cell-pad", children: [_jsx("button", { onClick: (e) => { e.stopPropagation(); onPickEmployee(p.email); }, className: "font-medium hover:underline text-left", children: p.name }), _jsx("div", { className: "text-[11px] text-muted dark:text-muted-dark num", children: p.email })] }), _jsx("td", { className: "cell-pad text-right num", children: p.batch }), _jsx("td", { className: "cell-pad text-[12px]", children: p.worstCompetency.competency }), _jsx("td", { className: "cell-pad text-right num font-semibold text-bad", children: p.worstCompetency.score }), _jsx("td", { className: "cell-pad text-right num", children: p.weakCompetencies.length }), _jsx("td", { className: "cell-pad", children: _jsx("span", { className: `inline-block px-2 py-0.5 text-[10px] uppercase tracking-wider font-semibold ${statusCls}`, children: statusLabel }) }), _jsx("td", { className: "cell-pad text-[12px] text-muted dark:text-muted-dark", children: p.reportingManager ?? _jsx("span", { className: "italic", children: "unassigned" }) })] }), isOpen && (_jsx("tr", { children: _jsx("td", { colSpan: 8, className: "p-4 bg-line/30 dark:bg-line-dark/20", children: _jsx(WeakCompetencies, { p: p, actions: actions }) }) }))] }));
}
function WeakCompetencies({ p, actions }) {
    return (_jsx("div", { className: "border hrule bg-bg dark:bg-bg-dark", children: _jsxs("table", { className: "w-full text-[13px]", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx(TH, { className: "w-[35%]", children: "Competency" }), _jsx(TH, { align: "right", className: "w-[10%]", children: "Score" }), _jsx(TH, { children: "Action" })] }) }), _jsx("tbody", { children: p.weakCompetencies.map(w => {
                        const action = actions.find(a => a.kind === 'reassessment' && a.id === reassessmentId(p.email, w.competency));
                        return (_jsxs("tr", { className: "border-b hrule last:border-b-0", children: [_jsx("td", { className: "cell-pad font-medium", children: w.competency }), _jsx("td", { className: "cell-pad text-right num text-bad font-semibold", children: w.score }), _jsx("td", { className: "cell-pad", children: action == null ? (_jsx("button", { className: "text-[11px] px-2 py-1 border border-accent text-accent hover:bg-accent hover:text-bg dark:hover:text-bg-dark", onClick: () => upsertAction({
                                            kind: 'reassessment', id: reassessmentId(p.email, w.competency),
                                            email: p.email, competency: w.competency,
                                            originalScore: w.score, newScore: null, status: 'scheduled',
                                            scheduledFor: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
                                            createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
                                        }), children: "+ Schedule re-assessment" })) : (_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: `inline-block px-2 py-0.5 text-[10px] uppercase tracking-wider font-medium
                        ${action.status === 'completed' ? 'bg-great/10 text-great border border-great/40'
                                                    : 'bg-avg/10 text-avg border border-avg/40'}`, children: action.status }), action.scheduledFor && _jsxs("span", { className: "text-[11px] num", children: ["on ", action.scheduledFor] }), action.status === 'scheduled' && (_jsx("button", { className: "text-[11px] px-2 py-1 border border-great text-great hover:bg-great hover:text-bg", onClick: () => upsertAction({ ...action, status: 'completed', newScore: action.newScore ?? 6, updatedAt: new Date().toISOString() }), children: "Mark completed" }))] })) })] }, w.competency));
                    }) })] }) }));
}
// ─── Employee Assessment Grid — redesigned ─────────────────────────────────
function EmployeeGrid({ ds, zmIdx, onPickEmployee, setFilters }) {
    const [expanded, setExpanded] = useState(new Set());
    const toggle = (k) => {
        const next = new Set(expanded);
        next.has(k) ? next.delete(k) : next.add(k);
        setExpanded(next);
    };
    const rows = useMemo(() => {
        return ds.employees.map(e => {
            const scoresByComp = {};
            let sumAll = 0, nAll = 0;
            const sessionsAssessed = new Set();
            for (const c of COMPETENCIES) {
                const rs = ds.assessments.filter(a => a.email === e.email && a.competency === c && a.score != null);
                if (rs.length === 0) {
                    scoresByComp[c] = null;
                    continue;
                }
                scoresByComp[c] = Math.round((rs.reduce((s, r) => s + r.score, 0) / rs.length) * 10) / 10;
                for (const r of rs)
                    sessionsAssessed.add(r.sessionNumber);
                sumAll += rs.reduce((s, r) => s + r.score, 0);
                nAll += rs.length;
            }
            const avg = nAll === 0 ? null : Math.round((sumAll / nAll) * 10) / 10;
            return { emp: e, scoresByComp, avg, sessions: sessionsAssessed.size };
        });
    }, [ds]);
    const enriched = useMemo(() => rows.map(r => ({
        ...r, name: r.emp.name, batch: r.emp.batch, email: r.emp.email,
    })), [rows]);
    const { sorted, sortKey, sortDir, toggle: toggleSort } = useSort(enriched, { key: 'avg', dir: 'asc' });
    if (rows.length === 0)
        return _jsx(Empty, { message: "No employees match current filter." });
    return (_jsx(Section, { title: "Employee Assessment Grid", hint: _jsx(InfoTip, { children: "Each row = one employee. Avg + sessions assessed live up front. Click a row to expand the per-session breakdown for that person." }), right: `${rows.length} employees`, children: _jsx("div", { className: "border hrule table-scroll", style: { maxHeight: 600 }, children: _jsxs("table", { className: "w-full text-[12px]", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx(TH, { align: "center", className: "w-[3%]", children: " " }), _jsx(TH, { sortKey: "name", current: sortKey, dir: sortDir, onToggle: toggleSort, sticky: true, className: "w-[18%] bg-bg dark:bg-bg-dark", children: "Employee" }), _jsx(TH, { sortKey: "batch", current: sortKey, dir: sortDir, onToggle: toggleSort, align: "right", className: "w-[5%]", children: "Batch" }), _jsx(TH, { sortKey: "avg", current: sortKey, dir: sortDir, onToggle: toggleSort, align: "right", className: "w-[7%]", children: "Avg" }), _jsx(TH, { sortKey: "sessions", current: sortKey, dir: sortDir, onToggle: toggleSort, align: "right", className: "w-[6%]", children: "Sessions" }), _jsx(TH, { align: "center", className: "w-[6%]", children: "Band" }), COMPETENCIES.map(c => {
                                    const lines = competencyLines(c);
                                    return (_jsx(TH, { align: "center", children: _jsxs("div", { className: "leading-tight text-center", children: [_jsx("div", { children: lines[0] }), lines[1] && _jsx("div", { children: lines[1] })] }) }, c));
                                })] }) }), _jsx("tbody", { children: sorted.map(r => {
                            const band = bandOf(r.avg);
                            return (_jsxs(Fragment, { children: [_jsxs("tr", { onClick: () => toggle(r.email), className: `border-b hrule cursor-pointer ${expanded.has(r.email) ? 'bg-ink/[0.04] dark:bg-ink-dark/[0.07]' : 'hover:bg-ink/[0.02] dark:hover:bg-ink-dark/[0.04]'}`, children: [_jsx("td", { className: "cell-pad text-center text-muted dark:text-muted-dark", children: expanded.has(r.email) ? '▾' : '▸' }), _jsxs("td", { className: "cell-pad sticky left-0 bg-bg dark:bg-bg-dark", children: [_jsx("button", { onClick: (e) => { e.stopPropagation(); setFilters(f => ({ ...f, employee: r.email })); }, className: "font-medium hover:underline text-left", children: r.emp.name }), _jsx("button", { onClick: (e) => { e.stopPropagation(); onPickEmployee(r.email); }, className: "ml-2 text-[10px] text-muted dark:text-muted-dark hover:underline", children: "profile\u2192" })] }), _jsx("td", { className: "cell-pad text-right num", children: r.batch }), _jsx("td", { className: "cell-pad text-right num", children: r.avg == null ? _jsx("span", { className: "text-muted dark:text-muted-dark", children: "\u2014" })
                                                    : _jsx("span", { className: "font-semibold", style: { color: BAND_COLOR[band] }, children: r.avg.toFixed(1) }) }), _jsx("td", { className: "cell-pad text-right num", children: r.sessions > 0 ? r.sessions : _jsx("span", { className: "text-muted dark:text-muted-dark", children: "0" }) }), _jsx("td", { className: "cell-pad text-center", children: band ? _jsx("span", { className: "px-1.5 py-0.5 text-[9px] font-bold uppercase", style: { color: BAND_COLOR[band] }, children: BAND_LABEL[band] })
                                                    : _jsx("span", { className: "text-[10px] text-muted dark:text-muted-dark", children: "\u2014" }) }), COMPETENCIES.map(c => (_jsx("td", { className: "px-1 py-1 text-center", children: _jsx(BandPill, { score: r.scoresByComp[c], band: bandOf(r.scoresByComp[c]), size: "xs", label: `${c}: ${r.scoresByComp[c] ?? 'n/a'}` }) }, c)))] }), expanded.has(r.email) && (_jsx("tr", { children: _jsx("td", { colSpan: 6 + COMPETENCIES.length, className: "p-3 bg-line/30 dark:bg-line-dark/20", children: _jsx(PerSessionBreakdown, { ds: ds, email: r.email }) }) }))] }, r.email));
                        }) })] }) }) }));
    void zmIdx;
}
function competencyLines(c) {
    const words = c.split(/\s+/);
    if (words.length === 1)
        return [c];
    return [words[0], words.slice(1).join(' ')];
}
function PerSessionBreakdown({ ds, email }) {
    const data = useMemo(() => buildScoreTrend(ds, email).filter(p => p.avgScore != null || COMPETENCIES.some(c => p.byCompetency[c] != null)), [ds, email]);
    if (data.length === 0)
        return _jsx(Empty, { message: "No assessments captured for this employee yet." });
    return (_jsx("div", { className: "border hrule bg-bg dark:bg-bg-dark", children: _jsxs("table", { className: "w-full text-[12px]", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx(TH, { className: "w-[10%]", children: "Session" }), _jsx(TH, { className: "w-[20%]", children: "Topic" }), _jsx(TH, { align: "right", className: "w-[8%]", children: "Avg" }), _jsx(TH, { align: "center", className: "w-[10%]", children: "Band" }), COMPETENCIES.map(c => {
                                const lines = competencyLines(c);
                                return (_jsx(TH, { align: "center", children: _jsxs("div", { className: "leading-tight", children: [_jsx("div", { children: lines[0] }), lines[1] && _jsx("div", { children: lines[1] })] }) }, c));
                            })] }) }), _jsx("tbody", { children: data.map(p => {
                        const sess = ds.sessions.find(s => s.sessionNumber === p.sessionNumber);
                        const band = bandOf(p.avgScore);
                        return (_jsxs("tr", { className: "border-b hrule last:border-b-0", children: [_jsx("td", { className: "cell-pad font-medium", children: p.sessionCode }), _jsx("td", { className: "cell-pad text-[11px] leading-tight", children: sess?.topic ?? '—' }), _jsx("td", { className: "cell-pad text-right num", children: p.avgScore == null ? _jsx("span", { className: "text-muted dark:text-muted-dark", children: "\u2014" })
                                        : _jsx("span", { className: "font-semibold", style: { color: BAND_COLOR[band] }, children: p.avgScore.toFixed(1) }) }), _jsx("td", { className: "cell-pad text-center", children: band ? _jsx("span", { className: "px-1.5 py-0.5 text-[9px] font-bold uppercase", style: { color: BAND_COLOR[band] }, children: BAND_LABEL[band] })
                                        : _jsx("span", { className: "text-[10px] text-muted dark:text-muted-dark", children: "\u2014" }) }), COMPETENCIES.map(c => (_jsx("td", { className: "px-1 py-1 text-center", children: _jsx(BandPill, { score: p.byCompetency[c], band: bandOf(p.byCompetency[c]), size: "xs", label: `${c}: ${p.byCompetency[c] ?? 'n/a'}` }) }, c)))] }, p.sessionNumber));
                    }) })] }) }));
}
