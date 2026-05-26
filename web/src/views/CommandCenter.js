import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useState } from 'react';
import { computeAttention, computeKpis, computeSessionStatus, summarizeEmployees, } from '../lib/derive';
import { drillSession } from '../lib/sessionDrill';
import { BATCHES, TOTAL_TRAINING_SESSIONS, ZONE_BY_BATCH, bandOf } from '../types';
import { InfoTip } from '../components/Tooltip';
import { Empty, PctCell, ScoreCell, Section, TH, useSort, usePager, Pager } from '../components/Atoms';
import { buildZmIndex, zmFor } from '../lib/zm';
export function CommandCenter({ ds, onPickEmployee }) {
    const summaries = useMemo(() => summarizeEmployees(ds), [ds]);
    const kpis = useMemo(() => computeKpis(ds, summaries), [ds, summaries]);
    const sessions = useMemo(() => computeSessionStatus(ds), [ds]);
    const attention = useMemo(() => computeAttention(summaries), [summaries]);
    const zmIdx = useMemo(() => buildZmIndex(ds), [ds]);
    return (_jsxs("div", { className: "flex flex-col gap-6", children: [_jsx(SessionProgressBar, { kpis: kpis, sessions: sessions }), _jsx(KpiStrip, { k: kpis }), _jsx(SessionTable, { rows: sessions, ds: ds, onPickEmployee: onPickEmployee, zmIdx: zmIdx }), _jsx(AttentionTable, { rows: attention, ds: ds, zmIdx: zmIdx, onPickEmployee: onPickEmployee })] }));
}
// ─── 1. Session Progress (10 sessions) ─────────────────────────────────────
function SessionProgressBar({ kpis, sessions }) {
    return (_jsxs(Section, { title: "Session Progress", hint: _jsxs(InfoTip, { children: [_jsx("b", { children: "10 sessions" }), " tracked (the Attendance tab spans S1\u2013S10). A session is ", _jsx("b", { children: "fully complete" }), " when all 5 batches have finished it. A pulsing green dot marks a session that is ", _jsx("b", { children: "in progress" }), " across some batches but not all yet."] }), right: _jsxs("span", { children: [_jsx("b", { className: "num text-base text-ink dark:text-ink-dark", children: kpis.sessionsCompleted }), _jsxs("span", { children: [" / ", kpis.sessionsTotal, " fully complete"] }), kpis.sessionsInProgress > 0 && _jsxs("span", { children: [" \u00B7 ", kpis.sessionsInProgress, " in progress"] })] }), children: [_jsx("div", { className: "grid grid-cols-10 gap-1", children: sessions.map(s => {
                    const isComplete = s.isFullyComplete;
                    const isInProgress = !isComplete && s.batchesCompleted > 0;
                    return (_jsx("div", { title: `${s.sessionCode} — ${s.batchesCompleted}/5 batches complete`, className: `relative h-5 ${isComplete ? 'bg-ink dark:bg-ink-dark'
                            : isInProgress ? 'bg-ink/30 dark:bg-ink-dark/30'
                                : 'bg-line dark:bg-line-dark'}`, children: isInProgress && (_jsx("span", { className: "absolute inset-0 flex items-center justify-center", "aria-label": "in progress", children: _jsx("span", { className: "block h-2.5 w-2.5 rounded-full bg-great animate-blink shadow-[0_0_0_2px_rgba(22,163,74,0.25)]" }) })) }, s.sessionNumber));
                }) }), _jsx("div", { className: "grid grid-cols-10 gap-1 mt-1.5", children: sessions.map(s => (_jsxs("div", { className: "text-[10px] text-center text-muted dark:text-muted-dark num", children: ["S", s.sessionNumber] }, s.sessionNumber))) })] }));
}
// ─── 2. KPI strip ──────────────────────────────────────────────────────────
function KpiStrip({ k }) {
    const tone = (v, bad, avg) => v == null ? undefined : v < bad ? 'bad' : v < avg ? 'avg' : 'great';
    const cells = [
        {
            label: 'Overall Attendance',
            value: `${k.overallAttendancePct.toFixed(1)}%`,
            tone: tone(k.overallAttendancePct, 70, 85),
            tip: _jsx(_Fragment, { children: "YES marks \u00F7 (YES + NO) across every employee \u00D7 held session 1\u201310." }),
        },
        {
            label: 'Avg Assessment',
            value: k.avgAssessmentScore != null ? `${k.avgAssessmentScore.toFixed(1)} / 10` : '—',
            sub: k.avgAssessmentScore != null
                ? (k.avgAssessmentScore < 3 ? 'weak' : k.avgAssessmentScore < 5 ? 'needs work' : 'on track')
                : 'not assessed',
            tone: tone(k.avgAssessmentScore, 3, 6),
            tip: _jsxs(_Fragment, { children: ["Average of every score recorded. Blank cells excluded. A literal ", _jsx("b", { children: "0" }), " counts."] }),
        },
        {
            label: 'Employees At Risk',
            value: `${k.employeesAtRisk}`,
            sub: `of ${k.activeEmployees} active`,
            tone: k.employeesAtRisk > 0 ? 'bad' : 'great',
            tip: _jsx(_Fragment, { children: "Weak (0\u20132) on any competency OR missed \u2265 2 sessions. Excludes Exit role." }),
        },
        {
            label: 'Trainer Utilization',
            value: `${k.trainerUtilizationPct.toFixed(1)}%`,
            tone: tone(k.trainerUtilizationPct, 30, 70),
            tip: _jsx(_Fragment, { children: "Delivered / assigned trainer-slots across sessions 1\u201310." }),
        },
    ];
    return (_jsx("section", { className: "grid grid-cols-1 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x hrule border-y hrule", children: cells.map(c => (_jsxs("div", { className: "px-4 py-4 flex flex-col gap-1", children: [_jsxs("div", { className: "label-xs flex items-center", children: [c.label, _jsx(InfoTip, { children: c.tip })] }), _jsxs("div", { className: "flex items-baseline gap-2", children: [_jsx("div", { className: "num text-3xl font-semibold", children: c.value }), c.tone && (_jsx("span", { className: `inline-block w-1.5 h-1.5 rounded-full
                ${c.tone === 'bad' ? 'bg-bad' : c.tone === 'avg' ? 'bg-avg' : 'bg-great'}` }))] }), c.sub && _jsx("div", { className: "text-[11px] text-muted dark:text-muted-dark", children: c.sub })] }, c.label))) }));
}
// ─── 3. Session table with 3-level drill-down ──────────────────────────────
function SessionTable({ rows, ds, onPickEmployee, zmIdx }) {
    const [expanded, setExpanded] = useState(new Set());
    const [grouping, setGrouping] = useState('batch');
    const toggle = (n) => {
        const next = new Set(expanded);
        next.has(n) ? next.delete(n) : next.add(n);
        setExpanded(next);
    };
    return (_jsx(Section, { title: "Sessions", hint: _jsx(InfoTip, { children: "One row per session. Click to drill into per-batch / per-ZM / per-zone attendance + trainer + average score, then into individual employees." }), right: _jsxs("span", { className: "inline-flex items-center gap-3", children: [_jsxs("span", { children: [TOTAL_TRAINING_SESSIONS, " sessions \u00B7 5 batches each"] }), _jsx(GroupToggle, { value: grouping, onChange: setGrouping })] }), children: _jsx("div", { className: "border hrule overflow-x-auto", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx(TH, { align: "center", className: "w-[3%]", children: " " }), _jsx(TH, { className: "w-[5%]", children: "#" }), _jsx(TH, { className: "w-[11%]", children: "Session" }), _jsx(TH, { children: "Topic" }), _jsx(TH, { className: "w-[14%]", children: _jsxs("span", { className: "inline-flex items-center", children: ["Batches", _jsx(InfoTip, { children: "\u25CF completed \u00B7 \u25D0 scheduled \u00B7 \u25CB no row in Calendar." })] }) }), _jsx(TH, { align: "right", className: "w-[8%]", children: "Att%" }), _jsx(TH, { align: "right", className: "w-[9%]", children: "Avg Score" }), _jsx(TH, { className: "w-[20%]", children: "Trainers" })] }) }), _jsx("tbody", { children: rows.map(s => (_jsx(SessionRow, { row: s, isOpen: expanded.has(s.sessionNumber), onToggle: () => toggle(s.sessionNumber), ds: ds, grouping: grouping, onPickEmployee: onPickEmployee, zmIdx: zmIdx }, s.sessionNumber))) })] }) }) }));
}
function GroupToggle({ value, onChange }) {
    const opts = [
        { id: 'batch', label: 'Batch', tip: 'Group by training batch (1–5)' },
        { id: 'zm', label: 'ZM', tip: 'Group by Zonal Manager (inherits across the zone)' },
        { id: 'zone', label: 'Zone', tip: 'Group by geographic zone' },
    ];
    return (_jsx("span", { className: "inline-flex border hrule", children: opts.map(o => (_jsx("button", { title: o.tip, onClick: () => onChange(o.id), className: `px-2 py-1 text-[11px] uppercase tracking-wider font-medium
            ${value === o.id
                ? 'bg-ink text-bg dark:bg-ink-dark dark:text-bg-dark'
                : 'hover:bg-ink/[0.04] dark:hover:bg-ink-dark/[0.04]'}`, children: o.label }, o.id))) }));
}
function SessionRow({ row, isOpen, onToggle, ds, grouping, onPickEmployee, zmIdx }) {
    const groups = useMemo(() => isOpen ? drillSession(ds, row.sessionNumber, grouping) : [], [isOpen, ds, row.sessionNumber, grouping]);
    return (_jsxs(_Fragment, { children: [_jsxs("tr", { onClick: onToggle, className: `border-b hrule cursor-pointer transition-colors
          ${isOpen ? 'bg-ink/[0.03] dark:bg-ink-dark/[0.05]' : 'hover:bg-ink/[0.02] dark:hover:bg-ink-dark/[0.04]'}`, children: [_jsx("td", { className: "cell-pad text-muted dark:text-muted-dark num text-center", children: isOpen ? '▾' : '▸' }), _jsx("td", { className: "cell-pad num text-muted dark:text-muted-dark", children: row.sessionNumber }), _jsx("td", { className: "cell-pad font-medium", children: row.sessionCode }), _jsx("td", { className: "cell-pad text-[13px] leading-tight", children: row.topic }), _jsx("td", { className: "cell-pad", children: _jsx(BatchDots, { row: row }) }), _jsx("td", { className: "cell-pad text-right", children: _jsx(PctCell, { value: row.attendancePct }) }), _jsx("td", { className: "cell-pad text-right", children: row.avgScore == null ? _jsx("span", { className: "text-muted dark:text-muted-dark", children: "\u2014" })
                            : _jsx(ScoreCell, { score: row.avgScore, band: bandOf(row.avgScore) }) }), _jsx("td", { className: "cell-pad text-[12px] num text-muted dark:text-muted-dark", children: row.trainers.join(', ') || '—' })] }), isOpen && (_jsx("tr", { children: _jsx("td", { colSpan: 8, className: "bg-line/40 dark:bg-line-dark/30 px-5 py-3 border-b hrule", children: _jsx(SessionGroups, { groups: groups, grouping: grouping, onPickEmployee: onPickEmployee, zmIdx: zmIdx }) }) }))] }));
}
function BatchDots({ row }) {
    return (_jsxs("div", { className: "flex items-center gap-1.5", children: [row.batches.map(b => {
                const cls = b.state === 'completed' ? 'bg-ink dark:bg-ink-dark border-ink dark:border-ink-dark'
                    : b.state === 'scheduled' ? 'bg-ink/30 dark:bg-ink-dark/30 border-ink/40 dark:border-ink-dark/40'
                        : 'border-line dark:border-line-dark';
                const label = `Batch ${b.batch} — ${ZONE_BY_BATCH[b.batch].zone}\n`
                    + `${b.state === 'completed' ? 'DONE' : b.state === 'scheduled' ? 'SCHEDULED' : 'NOT IN CALENDAR'}\n`
                    + (b.date ? `Date: ${b.date}\n` : '')
                    + (b.trainer ? `Trainer: ${b.trainer}\n` : '')
                    + (b.attendancePct != null ? `Attendance: ${b.attendancePct.toFixed(1)}%` : '');
                return (_jsx("span", { title: label, className: `inline-block h-2.5 w-2.5 rounded-full border ${cls} cursor-help` }, b.batch));
            }), _jsxs("span", { className: "ml-2 text-[10px] text-muted dark:text-muted-dark num", children: [row.batchesCompleted, "/", BATCHES.length] })] }));
}
// ─── Level 2: drilled groups (batches/ZMs/zones) ────────────────────────────
function SessionGroups({ groups, grouping, onPickEmployee, zmIdx }) {
    const [open, setOpen] = useState(new Set());
    const toggle = (k) => {
        const next = new Set(open);
        next.has(k) ? next.delete(k) : next.add(k);
        setOpen(next);
    };
    if (groups.length === 0)
        return _jsx(Empty, { message: "No groups for this view." });
    return (_jsx("div", { className: "border hrule bg-bg dark:bg-bg-dark", children: _jsxs("table", { className: "w-full text-[13px]", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx(TH, { align: "center", className: "w-[3%]", children: " " }), _jsx(TH, { className: "w-[18%]", children: grouping === 'batch' ? 'Batch' : grouping === 'zm' ? 'ZM' : 'Zone' }), _jsx(TH, { className: "w-[13%]", children: "Trainer \u00B7 Date" }), _jsx(TH, { align: "right", className: "w-[8%]", children: "Total" }), _jsx(TH, { align: "right", className: "w-[8%]", children: "Present" }), _jsx(TH, { align: "right", className: "w-[8%]", children: "Absent" }), _jsx(TH, { align: "right", className: "w-[8%]", children: "Att%" }), _jsx(TH, { align: "right", className: "w-[10%]", children: "Avg Score" }), _jsx(TH, { children: "ZM" })] }) }), _jsx("tbody", { children: groups.map(g => (_jsx(GroupRow, { group: g, isOpen: open.has(g.key), onToggle: () => toggle(g.key), onPickEmployee: onPickEmployee, zmIdx: zmIdx }, g.key))) })] }) }));
}
function GroupRow({ group, isOpen, onToggle, onPickEmployee, zmIdx }) {
    const stateDot = group.state === 'completed' ? 'bg-great' : group.state === 'scheduled' ? 'bg-avg' : 'bg-line dark:bg-line-dark';
    const zmDisplay = zmIdx.byBatch.get(group.batch) ?? group.zmName ?? null;
    return (_jsxs(_Fragment, { children: [_jsxs("tr", { onClick: onToggle, className: `border-b hrule cursor-pointer
          ${isOpen ? 'bg-ink/[0.04] dark:bg-ink-dark/[0.07]' : 'hover:bg-ink/[0.02] dark:hover:bg-ink-dark/[0.04]'}`, children: [_jsx("td", { className: "cell-pad text-muted dark:text-muted-dark text-center", children: isOpen ? '▾' : '▸' }), _jsxs("td", { className: "cell-pad", children: [_jsxs("div", { className: "font-medium flex items-center gap-2", children: [_jsx("span", { className: `inline-block w-1.5 h-1.5 rounded-full ${stateDot}` }), group.label] }), _jsx("div", { className: "text-[11px] text-muted dark:text-muted-dark", children: group.sublabel })] }), _jsxs("td", { className: "cell-pad text-[12px] num", children: [_jsx("div", { children: group.trainer ?? _jsx("span", { className: "text-muted dark:text-muted-dark", children: "\u2014 no trainer" }) }), _jsx("div", { className: "text-muted dark:text-muted-dark", children: group.date ?? 'TBD' })] }), _jsx("td", { className: "cell-pad text-right num font-semibold", children: group.totalEmployees }), _jsx("td", { className: "cell-pad text-right num text-great", children: group.present || '—' }), _jsx("td", { className: "cell-pad text-right num text-bad", children: group.absent || '—' }), _jsx("td", { className: "cell-pad text-right", children: _jsx(PctCell, { value: group.attendancePct }) }), _jsx("td", { className: "cell-pad text-right", children: _jsx(ScoreCell, { score: group.avgScore, band: group.band }) }), _jsx("td", { className: "cell-pad text-[12px] num text-muted dark:text-muted-dark", children: zmDisplay ?? _jsx("span", { className: "italic", children: "unassigned" }) })] }), isOpen && (_jsx("tr", { children: _jsx("td", { colSpan: 9, className: "px-4 py-2 bg-line/30 dark:bg-line-dark/20", children: _jsx(EmployeeList, { group: group, onPickEmployee: onPickEmployee }) }) }))] }));
}
// ─── Level 3: individuals ──────────────────────────────────────────────────
function EmployeeList({ group, onPickEmployee }) {
    if (group.employees.length === 0)
        return _jsx(Empty, { message: "No employees in this group." });
    return (_jsx("div", { className: "border hrule bg-bg dark:bg-bg-dark", children: _jsxs("table", { className: "w-full text-[12px]", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx(TH, { className: "w-[28%]", children: "Employee" }), _jsx(TH, { className: "w-[8%]", children: "Role" }), _jsx(TH, { className: "w-[14%]", children: "Area" }), _jsx(TH, { className: "w-[10%]", children: _jsxs("span", { className: "inline-flex items-center", children: ["This Session", _jsx(InfoTip, { children: "PRESENT \u00B7 ABSENT \u00B7 UPCOMING for this specific session." })] }) }), _jsx(TH, { align: "right", className: "w-[12%]", children: "Avg Score" }), _jsx(TH, { align: "right", children: _jsxs("span", { className: "inline-flex items-center", children: ["Whole-program Att%", _jsx(InfoTip, { align: "right", children: "Their total attendance across all held sessions." })] }) }), _jsx(TH, { align: "right", children: _jsxs("span", { className: "inline-flex items-center", children: ["Total Missed", _jsx(InfoTip, { align: "right", children: "Absences across the whole program. High = intervention candidate." })] }) })] }) }), _jsx("tbody", { children: group.employees.map(e => {
                        const attTone = e.attendanceStatus === 'present' ? 'text-great'
                            : e.attendanceStatus === 'absent' ? 'text-bad'
                                : e.attendanceStatus === 'rescheduled' ? 'text-accent'
                                    : 'text-muted dark:text-muted-dark';
                        const attLabel = e.attendanceStatus ? e.attendanceStatus.toUpperCase() : 'UPCOMING';
                        return (_jsxs("tr", { className: "border-b hrule last:border-b-0 hover:bg-ink/[0.03] dark:hover:bg-ink-dark/[0.05]", children: [_jsxs("td", { className: "cell-pad", children: [_jsx("button", { onClick: () => onPickEmployee(e.email), className: "font-medium hover:underline text-left", children: e.name }), _jsx("div", { className: "text-[10px] text-muted dark:text-muted-dark num", children: e.email })] }), _jsx("td", { className: "cell-pad num", children: _jsx("span", { className: `px-1.5 py-0.5 border hrule text-[10px] uppercase ${e.role === 'ZM' ? 'border-accent text-accent'
                                            : e.role === 'BDM' ? 'border-ink/40 dark:border-ink-dark/40'
                                                : e.role === 'BDA' ? 'border-line dark:border-line-dark text-muted dark:text-muted-dark'
                                                    : 'border-bad/40 text-bad'}`, children: e.role }) }), _jsx("td", { className: "cell-pad", children: e.area }), _jsx("td", { className: `cell-pad num font-medium ${attTone}`, children: attLabel }), _jsx("td", { className: "cell-pad text-right", children: _jsx(ScoreCell, { score: e.avgScore, band: e.band }) }), _jsx("td", { className: "cell-pad text-right", children: _jsx(PctCell, { value: e.totalAttendancePct }) }), _jsx("td", { className: "cell-pad text-right num", children: e.totalSessionsMissed > 0
                                        ? _jsx("span", { className: "text-bad", children: e.totalSessionsMissed })
                                        : _jsx("span", { className: "text-muted dark:text-muted-dark", children: "0" }) })] }, e.email));
                    }) })] }) }));
}
// ─── 4. Attention Required — sortable + paginated ──────────────────────────
function AttentionTable({ rows, ds, zmIdx, onPickEmployee }) {
    // Enrich rows with the resolved ZM for sorting/filtering
    const enriched = useMemo(() => rows.map(r => {
        const emp = ds.employees.find(e => e.email === r.email);
        return { ...r, zm: emp ? zmFor(emp, zmIdx) : 'Unassigned' };
    }), [rows, ds, zmIdx]);
    const { sorted, sortKey, sortDir, toggle } = useSort(enriched, { key: 'severity', dir: 'desc' });
    const pager = usePager(sorted, 15);
    return (_jsx(Section, { title: "Attention Required", hint: _jsx(InfoTip, { children: "Every active employee ranked by intervention urgency: \u22653 absences, low attendance, any Weak (0\u20132) score, etc. Each column is sortable; the list pages through everyone with an open issue." }), right: _jsxs("span", { children: [rows.length, " total \u00B7 sortable + paginated"] }), children: _jsxs("div", { className: "border hrule", children: [_jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx(TH, { sortKey: "name", current: sortKey, dir: sortDir, onToggle: toggle, className: "w-[28%]", children: "Employee" }), _jsx(TH, { sortKey: "batch", current: sortKey, dir: sortDir, onToggle: toggle, align: "right", className: "w-[7%]", children: "Batch" }), _jsx(TH, { sortKey: "severity", current: sortKey, dir: sortDir, onToggle: toggle, align: "right", className: "w-[10%]", children: "Severity" }), _jsx(TH, { sortKey: "issue", current: sortKey, dir: sortDir, onToggle: toggle, children: "Issue" }), _jsx(TH, { sortKey: "zm", current: sortKey, dir: sortDir, onToggle: toggle, className: "w-[20%]", children: "ZM" })] }) }), _jsxs("tbody", { children: [pager.slice.length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: 5, className: "cell-pad text-center text-muted dark:text-muted-dark py-6", children: "Nothing on fire. Program is healthy." }) })), pager.slice.map(r => (_jsxs("tr", { className: "border-b hrule last:border-b-0 hover:bg-ink/[0.02] dark:hover:bg-ink-dark/[0.04]", children: [_jsxs("td", { className: "cell-pad", children: [_jsx("button", { onClick: () => onPickEmployee(r.email), className: "font-medium hover:underline text-left", children: r.name }), _jsx("div", { className: "text-[11px] text-muted dark:text-muted-dark num", children: r.email })] }), _jsx("td", { className: "cell-pad text-right num", children: r.batch }), _jsx("td", { className: "cell-pad text-right num text-bad font-semibold", children: r.severity }), _jsx("td", { className: "cell-pad text-[13px]", children: r.issue }), _jsx("td", { className: "cell-pad text-[13px] text-muted dark:text-muted-dark", children: r.zm.startsWith('Unassigned') ? _jsx("span", { className: "italic", children: r.zm }) : r.zm })] }, r.email)))] })] }), _jsx(Pager, { ...pager })] }) }));
}
