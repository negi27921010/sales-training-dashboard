import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, PolarAngleAxis, PolarGrid, Radar, RadarChart, Tooltip as RTooltip, XAxis, YAxis, Legend, } from 'recharts';
import { buildProfile } from '../lib/sessionDrill';
import { BAND_COLOR, ZONE_BY_BATCH } from '../types';
import { InfoTip } from '../components/Tooltip';
import { Empty, ScoreCell, Section } from '../components/Atoms';
export function People({ ds, selected, onPickEmployee }) {
    const profile = useMemo(() => selected ? buildProfile(ds, selected) : null, [ds, selected]);
    return (_jsxs("div", { className: "flex flex-col gap-6", children: [_jsx(EmployeePicker, { ds: ds, selected: selected, onPick: onPickEmployee }), !profile && (_jsx(Empty, { message: "Search or pick an employee above to see their full training profile." })), profile && _jsx(Profile, { p: profile })] }));
}
function EmployeePicker({ ds, selected, onPick }) {
    const [q, setQ] = useState('');
    const matches = useMemo(() => {
        const term = q.trim().toLowerCase();
        if (!term)
            return ds.employees.slice(0, 12);
        return ds.employees
            .filter(e => e.name.toLowerCase().includes(term) || e.email.toLowerCase().includes(term) || e.area.toLowerCase().includes(term))
            .slice(0, 12);
    }, [ds, q]);
    return (_jsx(Section, { title: "Find Employee", hint: _jsx(InfoTip, { children: "Search by name, email, or city. Click a match to load the full profile." }), right: `${ds.employees.length} in scope`, children: _jsxs("div", { className: "border hrule p-3 flex gap-3 items-start", children: [_jsxs("div", { className: "flex-1", children: [_jsx("input", { type: "text", value: q, onChange: e => setQ(e.target.value), placeholder: "Type a name, email, or city\u2026", className: "w-full bg-transparent border hrule px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-accent" }), q && (_jsxs("div", { className: "mt-2 border hrule divide-y hrule max-h-72 overflow-auto", children: [matches.length === 0 && _jsx("div", { className: "px-3 py-2 text-xs text-muted dark:text-muted-dark", children: "No matches" }), matches.map(m => (_jsxs("button", { onClick: () => { onPick(m.email); setQ(''); }, className: "w-full text-left px-3 py-2 text-sm hover:bg-ink/[0.04] dark:hover:bg-ink-dark/[0.05]", children: [_jsx("div", { className: "font-medium", children: m.name }), _jsxs("div", { className: "text-[11px] text-muted dark:text-muted-dark num", children: [m.email, " \u00B7 Batch ", m.batch, " \u00B7 ", m.area, " \u00B7 ", m.role] })] }, m.email)))] }))] }), selected && (_jsx("button", { className: "btn-ghost", onClick: () => onPick(null), children: "CLEAR" }))] }) }));
}
function Profile({ p }) {
    return (_jsxs(_Fragment, { children: [_jsx(Header, { p: p }), _jsx(Timeline, { p: p }), _jsxs("div", { className: "grid grid-cols-12 gap-6", children: [_jsx("div", { className: "col-span-6", children: _jsx(Scorecard, { p: p }) }), _jsx("div", { className: "col-span-6", children: _jsx(TeamCompare, { p: p }) })] }), _jsx(ActionItems, { p: p }), _jsx(ScoreTable, { p: p })] }));
}
function Header({ p }) {
    const e = p.employee;
    return (_jsx("section", { className: "border-y hrule py-5", children: _jsxs("div", { className: "flex items-baseline gap-6", children: [_jsxs("div", { className: "flex-1", children: [_jsx("div", { className: "text-2xl font-semibold tracking-tight", children: e.name }), _jsxs("div", { className: "text-[12px] text-muted dark:text-muted-dark num", children: [e.email, " \u00B7 ", e.area, " \u00B7 ", ZONE_BY_BATCH[e.batch].zone] })] }), _jsx(Stat, { label: "Batch", value: `${e.batch}` }), _jsx(Stat, { label: "Role", value: e.role, tone: e.role === 'Exit' ? 'bad' : undefined }), _jsx(Stat, { label: "Avg Score", value: p.avgScore != null ? `${p.avgScore.toFixed(1)} / 10` : '—', tone: p.band === 'weak' ? 'bad' : p.band === 'ok' ? 'avg' : p.band ? 'good' : undefined }), _jsx(Stat, { label: "Attendance", value: p.attendancePct != null ? `${p.attendancePct.toFixed(1)}%` : '—', tone: p.attendancePct == null ? undefined : p.attendancePct < 70 ? 'bad' : p.attendancePct < 85 ? 'avg' : 'good' }), _jsx(Stat, { label: "Missed", value: `${p.sessionsMissed}`, tone: p.sessionsMissed === 0 ? 'good' : p.sessionsMissed >= 2 ? 'bad' : 'avg' }), _jsx(Stat, { label: "Action Items", value: `${p.actionItems.length}`, tone: p.actionItems.length === 0 ? 'good' : 'bad' })] }) }));
}
function Stat({ label, value, tone }) {
    return (_jsxs("div", { className: "flex flex-col gap-0.5 min-w-[100px]", children: [_jsx("div", { className: "label-xs", children: label }), _jsxs("div", { className: "flex items-baseline gap-1.5", children: [_jsx("div", { className: "num text-xl font-semibold", children: value }), tone && _jsx("span", { className: `inline-block w-1.5 h-1.5 rounded-full
          ${tone === 'bad' ? 'bg-bad' : tone === 'avg' ? 'bg-avg' : 'bg-good'}` })] })] }));
}
function Timeline({ p }) {
    return (_jsx(Section, { title: "Attendance Timeline", hint: _jsx(InfoTip, { children: "One slot per session. \u2713 present \u00B7 \u2717 absent \u00B7 \u21BB rescheduled \u00B7 \u25CB upcoming." }), children: _jsx("div", { className: "border hrule p-3 grid grid-cols-10 gap-2", children: p.attendanceTimeline.map(t => {
                const icon = t.status === 'present' ? '✓'
                    : t.status === 'absent' ? '✗'
                        : t.status === 'rescheduled' ? '↻'
                            : '○';
                const cls = t.status === 'present' ? 'border-good text-good bg-good/5'
                    : t.status === 'absent' ? 'border-bad text-bad bg-bad/5'
                        : t.status === 'rescheduled' ? 'border-accent text-accent bg-accent/5'
                            : 'border-line dark:border-line-dark text-muted dark:text-muted-dark';
                return (_jsxs("div", { className: `border ${cls} px-2 py-2 flex flex-col items-center gap-0.5`, children: [_jsx("div", { className: "text-lg leading-none num", children: icon }), _jsxs("div", { className: "text-[10px] num", children: ["S", t.sessionNumber] }), _jsx("div", { className: "text-[9px] text-muted dark:text-muted-dark text-center leading-tight", children: t.sessionCode }), t.date && _jsx("div", { className: "text-[9px] num text-muted dark:text-muted-dark", children: t.date.slice(5) })] }, t.sessionNumber));
            }) }) }));
}
function Scorecard({ p }) {
    const data = p.perCompetency.map(c => ({ competency: c.competency, score: c.score ?? 0 }));
    return (_jsx(Section, { title: "Competency Scorecard", hint: _jsx(InfoTip, { children: "10 competencies as a radar. Larger shape = stronger across the board." }), children: _jsx("div", { className: "border hrule p-3 h-72 bg-bg dark:bg-bg-dark", children: _jsx(ResponsiveContainer, { width: "100%", height: "100%", children: _jsxs(RadarChart, { outerRadius: "78%", data: data, children: [_jsx(PolarGrid, { stroke: "currentColor", strokeOpacity: 0.15 }), _jsx(PolarAngleAxis, { dataKey: "competency", tick: { fontSize: 9, fill: 'currentColor' } }), _jsx(Radar, { dataKey: "score", stroke: "#0D9488", fill: "#0D9488", fillOpacity: 0.25 }), _jsx(RTooltip, { contentStyle: { fontSize: 12, background: 'rgba(10,10,10,0.92)', color: '#fff', border: 'none' }, formatter: (v) => [`${v} / 10`, 'Score'] })] }) }) }) }));
}
function TeamCompare({ p }) {
    const data = p.teamComparison.map(c => ({
        name: c.competency.split(' ').slice(0, 2).join(' '),
        me: c.me ?? 0,
        team: c.team ?? 0,
    }));
    return (_jsx(Section, { title: _jsxs(_Fragment, { children: ["vs ", p.teamLabel] }), hint: _jsx(InfoTip, { children: "Per-competency comparison: this employee's score (teal) vs their team's average (grey). A short teal bar next to a tall grey bar is a flag." }), children: _jsx("div", { className: "border hrule p-3 h-72 bg-bg dark:bg-bg-dark", children: _jsx(ResponsiveContainer, { width: "100%", height: "100%", children: _jsxs(BarChart, { data: data, margin: { top: 8, right: 8, bottom: 24, left: 0 }, children: [_jsx(CartesianGrid, { strokeDasharray: "3 3", stroke: "currentColor", strokeOpacity: 0.08 }), _jsx(XAxis, { dataKey: "name", tick: { fontSize: 9, fill: 'currentColor' }, interval: 0, angle: -30, textAnchor: "end" }), _jsx(YAxis, { domain: [0, 10], tick: { fontSize: 10, fill: 'currentColor' } }), _jsx(RTooltip, { contentStyle: { fontSize: 12, background: 'rgba(10,10,10,0.92)', color: '#fff', border: 'none' } }), _jsx(Legend, { wrapperStyle: { fontSize: 10 } }), _jsx(Bar, { dataKey: "me", name: p.employee.name.split(' ')[0], fill: "#0D9488" }), _jsx(Bar, { dataKey: "team", name: "Team avg", fill: "#6B7280", fillOpacity: 0.6 })] }) }) }) }));
}
function ActionItems({ p }) {
    return (_jsx(Section, { title: "Action Items", hint: _jsx(InfoTip, { children: "Auto-generated from missed sessions and bad competency scores. Each item is something a Reporting Manager should resolve." }), right: `${p.actionItems.length} items`, children: p.actionItems.length === 0 ? _jsx(Empty, { message: "No action items. Employee is on track." }) : (_jsx("ol", { className: "border hrule divide-y hrule", children: p.actionItems.map((a, i) => (_jsxs("li", { className: "cell-pad flex items-baseline gap-3", children: [_jsx("span", { className: "num text-[10px] text-muted dark:text-muted-dark w-6", children: String(i + 1).padStart(2, '0') }), _jsx("span", { className: "text-sm", children: a })] }, i))) })) }));
}
function ScoreTable({ p }) {
    return (_jsx(Section, { title: "All Scores", children: _jsx("div", { className: "border hrule", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "label-xs border-b hrule text-left", children: [_jsx("th", { className: "cell-pad font-normal w-[60%]", children: "Competency" }), _jsx("th", { className: "cell-pad font-normal w-[15%] text-right", children: "Score" }), _jsx("th", { className: "cell-pad font-normal w-[25%]", children: "Band" })] }) }), _jsx("tbody", { children: p.perCompetency.map(c => (_jsxs("tr", { className: "border-b hrule last:border-b-0", children: [_jsx("td", { className: "cell-pad font-medium", children: c.competency }), _jsx("td", { className: "cell-pad text-right", children: _jsx(ScoreCell, { score: c.score, band: c.band }) }), _jsx("td", { className: "cell-pad", children: c.band
                                        ? _jsxs("span", { className: "inline-flex items-center gap-2 text-[12px]", children: [_jsx("span", { className: "inline-block w-2 h-2", style: { background: BAND_COLOR[c.band] } }), c.band.toUpperCase()] })
                                        : _jsx("span", { className: "text-muted dark:text-muted-dark text-[12px]", children: "NOT ASSESSED" }) })] }, c.competency))) })] }) }) }));
}
