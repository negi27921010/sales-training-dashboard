import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from 'react';
import { BATCHES, TOTAL_TRAINING_SESSIONS, ZONE_BY_BATCH, BAND_COLOR, bandOf } from '../types';
import { buildZmIndex, zmFor } from '../lib/zm';
import { InfoTip } from '../components/Tooltip';
import { Empty, PctCell, ScoreCell, Section } from '../components/Atoms';
// ─── Time model — overridable assumptions ──────────────────────────────────
const DEFAULT_TIME_MODEL = {
    workdayHours: 8,
    trainer: {
        sessionPrepHours: 1.0, // per session per trainer-batch
        sessionDeliveryHours: 2.0, // per session per trainer-batch
        assessmentCreationHours: 1.5, // per session (one-off across batches)
        assessmentPerEmployee: 0.25, // per assessed employee
    },
    salesperson: {
        preReadHours: 0.5, // per session attended
        sessionAttendance: 2.0, // per session attended
        assessmentTaking: 0.5, // per session attended where they were assessed
        postReadHours: 0.5, // per session attended
    },
};
export function CapacityOps({ ds }) {
    const [model, setModel] = useState(DEFAULT_TIME_MODEL);
    return (_jsxs("div", { className: "flex flex-col gap-6", children: [_jsx(CapacityHeadline, { ds: ds, model: model }), _jsx(TimeAssumptions, { model: model, onChange: setModel }), _jsx(TrainerTimeUtilization, { ds: ds, model: model }), _jsx(SalespersonTimeUtilization, { ds: ds, model: model }), _jsx(TrainerXBatch, { ds: ds }), _jsxs("div", { className: "grid grid-cols-12 gap-6", children: [_jsx("div", { className: "col-span-6", children: _jsx(ZoneRollup, { ds: ds }) }), _jsx("div", { className: "col-span-6", children: _jsx(RMSummary, { ds: ds }) })] })] }));
}
// ─── Headline numbers ──────────────────────────────────────────────────────
function CapacityHeadline({ ds, model }) {
    const stats = useMemo(() => {
        const active = ds.employees.filter(e => e.isActive);
        const trainers = Array.from(new Set(ds.batchSessions.map(b => b.trainerName).filter(Boolean)));
        const inWin = ds.batchSessions.filter(b => b.sessionNumber <= TOTAL_TRAINING_SESSIONS);
        const totalSlots = trainers.length * TOTAL_TRAINING_SESSIONS * BATCHES.length;
        const slotsAssigned = inWin.filter(b => b.trainerName).length;
        const slotsDelivered = inWin.filter(b => b.status === 'completed' && b.trainerName).length;
        // Trainer hours invested so far
        let trainerHours = 0;
        const completedBatchSessions = inWin.filter(b => b.status === 'completed' && b.trainerName);
        trainerHours += completedBatchSessions.length * (model.trainer.sessionPrepHours + model.trainer.sessionDeliveryHours);
        // assessment creation is one-off per session
        const sessionsWithAssessments = new Set(ds.assessments.filter(a => a.score != null).map(a => a.sessionNumber));
        trainerHours += sessionsWithAssessments.size * model.trainer.assessmentCreationHours;
        const assessmentCount = ds.assessments.filter(a => a.score != null).length;
        trainerHours += assessmentCount * model.trainer.assessmentPerEmployee;
        // Salesperson hours invested
        let salespersonHours = 0;
        const attendedRows = ds.attendance.filter(a => a.status === 'present' && a.sessionNumber <= TOTAL_TRAINING_SESSIONS);
        salespersonHours += attendedRows.length * (model.salesperson.preReadHours + model.salesperson.sessionAttendance + model.salesperson.postReadHours);
        const assessedPersonSessions = new Set(ds.assessments.filter(a => a.score != null).map(a => `${a.email}-${a.sessionNumber}`)).size;
        salespersonHours += assessedPersonSessions * model.salesperson.assessmentTaking;
        return {
            activeCount: active.length,
            trainerCount: trainers.length,
            totalSlots,
            slotsAssigned,
            slotsDelivered,
            trainerHours: Math.round(trainerHours * 10) / 10,
            salespersonHours: Math.round(salespersonHours * 10) / 10,
            trainerWorkdays: Math.round((trainerHours / model.workdayHours) * 10) / 10,
            salespersonWorkdays: Math.round((salespersonHours / model.workdayHours) * 10) / 10,
        };
    }, [ds, model]);
    return (_jsx(Section, { title: "Capacity Headline", hint: _jsx(InfoTip, { children: "Sessions and hours invested. The Time Assumptions block below feeds these numbers \u2014 change a value there to see this update." }), children: _jsxs("div", { className: "grid grid-cols-4 divide-x hrule border-y hrule", children: [_jsx(Big, { label: "Trainer Slots", value: `${stats.slotsDelivered} / ${stats.slotsAssigned}`, sub: `of ${stats.totalSlots} total (${stats.trainerCount} trainers × ${TOTAL_TRAINING_SESSIONS} sessions × ${BATCHES.length} batches)` }), _jsx(Big, { label: "Trainer Hours", value: `${stats.trainerHours} h`, sub: `≈ ${stats.trainerWorkdays} workdays (${model.workdayHours}h day)` }), _jsx(Big, { label: "Salesperson Hours", value: `${stats.salespersonHours} h`, sub: `across ${stats.activeCount} active people` }), _jsx(Big, { label: "Avg Hours / Salesperson", value: `${stats.activeCount ? (stats.salespersonHours / stats.activeCount).toFixed(1) : '—'} h`, sub: `≈ ${(stats.salespersonHours / stats.activeCount / model.workdayHours).toFixed(2)} workdays each` })] }) }));
}
function Big({ label, value, sub }) {
    return (_jsxs("div", { className: "px-4 py-4 flex flex-col gap-1", children: [_jsx("div", { className: "label-xs", children: label }), _jsx("div", { className: "num text-2xl font-semibold", children: value }), _jsx("div", { className: "text-[11px] text-muted dark:text-muted-dark", children: sub })] }));
}
// ─── Editable time assumptions ─────────────────────────────────────────────
function TimeAssumptions({ model, onChange }) {
    const [open, setOpen] = useState(false);
    const set = (path, v) => {
        const next = JSON.parse(JSON.stringify(model));
        const parts = path.split('.');
        let cur = next;
        for (let i = 0; i < parts.length - 1; i++)
            cur = cur[parts[i]];
        cur[parts[parts.length - 1]] = v;
        onChange(next);
    };
    return (_jsx(Section, { title: "Time Assumptions", hint: _jsx(InfoTip, { children: "Every hour figure on this page comes from these per-activity estimates. Tune them as your team's real cadence becomes clearer; the page recomputes live." }), right: _jsx("button", { className: "btn-ghost", onClick: () => setOpen(!open), children: open ? 'COLLAPSE' : 'EDIT' }), children: open ? (_jsxs("div", { className: "border hrule p-4 grid grid-cols-2 gap-x-8 gap-y-3 text-sm", children: [_jsxs("div", { children: [_jsx("div", { className: "label-xs mb-2", children: "Trainer time per activity (hours)" }), _jsx(Field, { label: "Session prep", value: model.trainer.sessionPrepHours, onChange: v => set('trainer.sessionPrepHours', v) }), _jsx(Field, { label: "Session delivery", value: model.trainer.sessionDeliveryHours, onChange: v => set('trainer.sessionDeliveryHours', v) }), _jsx(Field, { label: "Assessment creation", value: model.trainer.assessmentCreationHours, onChange: v => set('trainer.assessmentCreationHours', v) }), _jsx(Field, { label: "Per-employee assessment", value: model.trainer.assessmentPerEmployee, onChange: v => set('trainer.assessmentPerEmployee', v) })] }), _jsxs("div", { children: [_jsx("div", { className: "label-xs mb-2", children: "Salesperson time per attended session (hours)" }), _jsx(Field, { label: "Pre-read", value: model.salesperson.preReadHours, onChange: v => set('salesperson.preReadHours', v) }), _jsx(Field, { label: "Session attendance", value: model.salesperson.sessionAttendance, onChange: v => set('salesperson.sessionAttendance', v) }), _jsx(Field, { label: "Assessment taking", value: model.salesperson.assessmentTaking, onChange: v => set('salesperson.assessmentTaking', v) }), _jsx(Field, { label: "Post-read", value: model.salesperson.postReadHours, onChange: v => set('salesperson.postReadHours', v) }), _jsx(Field, { label: "Workday hours", value: model.workdayHours, onChange: v => set('workdayHours', v) })] })] })) : (_jsxs("div", { className: "border hrule px-4 py-3 text-[12px] text-muted dark:text-muted-dark grid grid-cols-2 gap-x-8", children: [_jsxs("div", { children: [_jsx("b", { className: "text-ink dark:text-ink-dark", children: "Trainer:" }), " prep ", model.trainer.sessionPrepHours, "h \u00B7 delivery ", model.trainer.sessionDeliveryHours, "h \u00B7 creation ", model.trainer.assessmentCreationHours, "h \u00B7 per-employee assess ", model.trainer.assessmentPerEmployee, "h"] }), _jsxs("div", { children: [_jsx("b", { className: "text-ink dark:text-ink-dark", children: "Salesperson / session:" }), " pre-read ", model.salesperson.preReadHours, "h \u00B7 session ", model.salesperson.sessionAttendance, "h \u00B7 assess ", model.salesperson.assessmentTaking, "h \u00B7 post-read ", model.salesperson.postReadHours, "h \u00B7 ", model.workdayHours, "h workday"] })] })) }));
}
function Field({ label, value, onChange }) {
    return (_jsxs("label", { className: "flex items-center justify-between gap-3 py-1", children: [_jsx("span", { className: "text-[12px]", children: label }), _jsx("input", { type: "number", min: 0, step: 0.25, value: value, onChange: e => onChange(parseFloat(e.target.value) || 0), className: "num w-20 bg-transparent border hrule px-2 py-1 text-right text-[12px] outline-none focus:ring-1 focus:ring-accent" })] }));
}
// ─── Trainer time utilization (stacked bar) ────────────────────────────────
function TrainerTimeUtilization({ ds, model }) {
    const rows = useMemo(() => {
        const trainers = Array.from(new Set(ds.batchSessions.map(b => b.trainerName).filter(Boolean)));
        return trainers.map(t => {
            const delivered = ds.batchSessions.filter(b => b.trainerName === t && b.status === 'completed' && b.sessionNumber <= TOTAL_TRAINING_SESSIONS);
            const sessionsWithAssessment = new Set(delivered.map(d => d.sessionNumber));
            const assessmentsPushed = ds.assessments.filter(a => a.score != null
                && delivered.some(d => d.sessionNumber === a.sessionNumber)
                && ds.employees.some(e => e.email === a.email && delivered.some(d => d.batch === e.batch))).length;
            const prep = delivered.length * model.trainer.sessionPrepHours;
            const delivery = delivered.length * model.trainer.sessionDeliveryHours;
            const creation = sessionsWithAssessment.size * model.trainer.assessmentCreationHours;
            const assessing = assessmentsPushed * model.trainer.assessmentPerEmployee;
            const total = prep + delivery + creation + assessing;
            return {
                trainer: t,
                sessionsDelivered: delivered.length,
                prep, delivery, creation, assessing, total,
                workdays: total / model.workdayHours,
            };
        }).sort((a, b) => b.total - a.total);
    }, [ds, model]);
    if (rows.length === 0)
        return _jsx(Empty, { message: "No completed sessions yet." });
    const max = Math.max(...rows.map(r => r.total), 1);
    return (_jsx(Section, { title: "Trainer Time Utilization", hint: _jsx(InfoTip, { children: "Hours each trainer has spent across the four activities. The bar shows the mix; the number on the right is total hours and workday equivalents." }), children: _jsxs("div", { className: "border hrule", children: [_jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "label-xs border-b hrule text-left", children: [_jsx("th", { className: "cell-pad font-normal w-[15%]", children: "Trainer" }), _jsx("th", { className: "cell-pad font-normal w-[10%] text-right", children: "Sessions" }), _jsx("th", { className: "cell-pad font-normal w-[40%]", children: "Time Breakdown" }), _jsx("th", { className: "cell-pad font-normal w-[8%] text-right", children: "Prep" }), _jsx("th", { className: "cell-pad font-normal w-[8%] text-right", children: "Deliver" }), _jsx("th", { className: "cell-pad font-normal w-[8%] text-right", children: "Create" }), _jsx("th", { className: "cell-pad font-normal w-[8%] text-right", children: "Assess" }), _jsx("th", { className: "cell-pad font-normal w-[10%] text-right", children: "Total" })] }) }), _jsx("tbody", { children: rows.map(r => (_jsxs("tr", { className: "border-b hrule last:border-b-0", children: [_jsx("td", { className: "cell-pad font-medium", children: r.trainer }), _jsx("td", { className: "cell-pad text-right num", children: r.sessionsDelivered }), _jsx("td", { className: "cell-pad", children: _jsx(StackedBar, { segments: [
                                                { v: r.prep, cls: 'bg-ink/30 dark:bg-ink-dark/30', label: 'prep' },
                                                { v: r.delivery, cls: 'bg-ink dark:bg-ink-dark', label: 'delivery' },
                                                { v: r.creation, cls: 'bg-accent', label: 'creation' },
                                                { v: r.assessing, cls: 'bg-accent/50', label: 'assessing' },
                                            ], max: max }) }), _jsxs("td", { className: "cell-pad text-right num text-[12px]", children: [r.prep.toFixed(1), "h"] }), _jsxs("td", { className: "cell-pad text-right num text-[12px]", children: [r.delivery.toFixed(1), "h"] }), _jsxs("td", { className: "cell-pad text-right num text-[12px]", children: [r.creation.toFixed(1), "h"] }), _jsxs("td", { className: "cell-pad text-right num text-[12px]", children: [r.assessing.toFixed(1), "h"] }), _jsxs("td", { className: "cell-pad text-right num", children: [_jsxs("div", { className: "font-semibold", children: [r.total.toFixed(1), "h"] }), _jsxs("div", { className: "text-[10px] text-muted dark:text-muted-dark", children: [r.workdays.toFixed(2), " days"] })] })] }, r.trainer))) })] }), _jsx(Legend, { items: [
                        { cls: 'bg-ink/30 dark:bg-ink-dark/30', label: 'Prep' },
                        { cls: 'bg-ink dark:bg-ink-dark', label: 'Delivery' },
                        { cls: 'bg-accent', label: 'Assessment creation' },
                        { cls: 'bg-accent/50', label: 'Assessment conduction' },
                    ] })] }) }));
}
// ─── Salesperson time utilization ──────────────────────────────────────────
function SalespersonTimeUtilization({ ds, model }) {
    const rows = useMemo(() => {
        return ds.employees.filter(e => e.isActive).map(e => {
            const attendedSessions = ds.attendance.filter(a => a.email === e.email && a.status === 'present' && a.sessionNumber <= TOTAL_TRAINING_SESSIONS);
            const assessedSessions = new Set(ds.assessments.filter(a => a.email === e.email && a.score != null).map(a => a.sessionNumber));
            const preRead = attendedSessions.length * model.salesperson.preReadHours;
            const session = attendedSessions.length * model.salesperson.sessionAttendance;
            const assessing = attendedSessions.filter(a => assessedSessions.has(a.sessionNumber)).length * model.salesperson.assessmentTaking;
            const postRead = attendedSessions.length * model.salesperson.postReadHours;
            const total = preRead + session + assessing + postRead;
            const avgScored = ds.assessments.filter(a => a.email === e.email && a.score != null);
            const avg = avgScored.length === 0 ? null
                : Math.round((avgScored.reduce((s, x) => s + x.score, 0) / avgScored.length) * 10) / 10;
            return {
                emp: e,
                attended: attendedSessions.length,
                preRead, session, assessing, postRead, total,
                workdays: total / model.workdayHours,
                avgScore: avg,
            };
        }).sort((a, b) => b.total - a.total);
    }, [ds, model]);
    if (rows.length === 0)
        return null;
    const max = Math.max(...rows.map(r => r.total), 1);
    return (_jsx(Section, { title: "Salesperson Time Utilization", hint: _jsx(InfoTip, { children: "Hours each salesperson has invested across pre-read, sitting in sessions, taking assessments, and post-read. Sorted by total hours spent." }), right: `${rows.length} active people`, children: _jsxs("div", { className: "border hrule overflow-auto", style: { maxHeight: 520 }, children: [_jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { className: "sticky top-0 bg-bg dark:bg-bg-dark z-10", children: _jsxs("tr", { className: "label-xs border-b hrule text-left", children: [_jsx("th", { className: "cell-pad font-normal sticky left-0 bg-bg dark:bg-bg-dark w-[20%]", children: "Employee" }), _jsx("th", { className: "cell-pad font-normal w-[5%]", children: "B" }), _jsx("th", { className: "cell-pad font-normal w-[7%] text-right", children: "Attended" }), _jsx("th", { className: "cell-pad font-normal w-[34%]", children: "Time Breakdown" }), _jsx("th", { className: "cell-pad font-normal w-[7%] text-right", children: "Pre" }), _jsx("th", { className: "cell-pad font-normal w-[7%] text-right", children: "Session" }), _jsx("th", { className: "cell-pad font-normal w-[7%] text-right", children: "Assess" }), _jsx("th", { className: "cell-pad font-normal w-[7%] text-right", children: "Post" }), _jsx("th", { className: "cell-pad font-normal w-[9%] text-right", children: "Total" }), _jsx("th", { className: "cell-pad font-normal w-[7%] text-right", children: "Avg" })] }) }), _jsx("tbody", { children: rows.map(r => (_jsxs("tr", { className: "border-b hrule last:border-b-0 hover:bg-ink/[0.02] dark:hover:bg-ink-dark/[0.04]", children: [_jsx("td", { className: "cell-pad sticky left-0 bg-bg dark:bg-bg-dark font-medium", children: r.emp.name }), _jsx("td", { className: "cell-pad num", children: r.emp.batch }), _jsx("td", { className: "cell-pad text-right num", children: r.attended }), _jsx("td", { className: "cell-pad", children: _jsx(StackedBar, { segments: [
                                                { v: r.preRead, cls: 'bg-accent/30', label: 'pre' },
                                                { v: r.session, cls: 'bg-ink dark:bg-ink-dark', label: 'session' },
                                                { v: r.assessing, cls: 'bg-accent', label: 'assess' },
                                                { v: r.postRead, cls: 'bg-accent/50', label: 'post' },
                                            ], max: max }) }), _jsx("td", { className: "cell-pad text-right num text-[11px]", children: r.preRead.toFixed(1) }), _jsx("td", { className: "cell-pad text-right num text-[11px]", children: r.session.toFixed(1) }), _jsx("td", { className: "cell-pad text-right num text-[11px]", children: r.assessing.toFixed(1) }), _jsx("td", { className: "cell-pad text-right num text-[11px]", children: r.postRead.toFixed(1) }), _jsxs("td", { className: "cell-pad text-right num", children: [_jsxs("div", { className: "font-semibold", children: [r.total.toFixed(1), "h"] }), _jsxs("div", { className: "text-[10px] text-muted dark:text-muted-dark", children: [r.workdays.toFixed(2), "d"] })] }), _jsx("td", { className: "cell-pad text-right", children: r.avgScore == null ? _jsx("span", { className: "text-muted dark:text-muted-dark", children: "\u2014" })
                                            : _jsx("span", { style: { color: BAND_COLOR[bandOf(r.avgScore)] }, className: "num", children: r.avgScore.toFixed(1) }) })] }, r.emp.email))) })] }), _jsx(Legend, { items: [
                        { cls: 'bg-accent/30', label: 'Pre-read' },
                        { cls: 'bg-ink dark:bg-ink-dark', label: 'Session attendance' },
                        { cls: 'bg-accent', label: 'Assessment taking' },
                        { cls: 'bg-accent/50', label: 'Post-read' },
                    ] })] }) }));
}
function StackedBar({ segments, max }) {
    const total = segments.reduce((s, x) => s + x.v, 0);
    const pct = (n) => (max === 0 ? 0 : (n / max) * 100);
    return (_jsx("div", { className: "flex h-3 w-full", title: `Total ${total.toFixed(1)}h`, children: segments.map((s, i) => (_jsx("div", { className: s.cls, style: { width: `${pct(s.v)}%` }, title: `${s.label}: ${s.v.toFixed(1)}h` }, i))) }));
}
function Legend({ items }) {
    return (_jsx("div", { className: "flex items-center gap-4 px-4 py-2 border-t hrule text-[10px] text-muted dark:text-muted-dark", children: items.map((it, i) => (_jsxs("span", { className: "inline-flex items-center gap-1.5", children: [_jsx("span", { className: `inline-block h-2 w-3 ${it.cls}` }), it.label] }, i))) }));
}
// ─── Trainer × Batch matrix (unchanged) ────────────────────────────────────
function TrainerXBatch({ ds }) {
    const trainers = useMemo(() => Array.from(new Set(ds.batchSessions.map(b => b.trainerName).filter(Boolean))).sort(), [ds]);
    const matrix = useMemo(() => {
        return trainers.map(t => {
            const cells = BATCHES.map(b => {
                const rows = ds.batchSessions.filter(x => x.trainerName === t && x.batch === b && x.sessionNumber <= TOTAL_TRAINING_SESSIONS);
                return {
                    assigned: rows.length,
                    delivered: rows.filter(r => r.status === 'completed').length,
                };
            });
            return { trainer: t, cells };
        });
    }, [ds, trainers]);
    if (trainers.length === 0)
        return null;
    const max = Math.max(...matrix.flatMap(m => m.cells.map(c => c.assigned)), 1);
    return (_jsx(Section, { title: "Trainer \u00D7 Batch Concentration", hint: _jsx(InfoTip, { children: "Darker = more sessions for that (trainer, batch) pair. Cell shows delivered / assigned." }), children: _jsx("div", { className: "border hrule overflow-x-auto", children: _jsxs("table", { className: "w-full text-[13px]", children: [_jsx("thead", { children: _jsxs("tr", { className: "label-xs border-b hrule text-left", children: [_jsx("th", { className: "cell-pad font-normal w-[20%]", children: "Trainer" }), BATCHES.map(b => (_jsxs("th", { className: "cell-pad font-normal text-center", children: [_jsxs("div", { children: ["BATCH ", b] }), _jsx("div", { className: "text-[10px] text-muted dark:text-muted-dark normal-case", children: ZONE_BY_BATCH[b].zone })] }, b))), _jsx("th", { className: "cell-pad font-normal text-right w-[10%]", children: "Total" })] }) }), _jsx("tbody", { children: matrix.map(({ trainer, cells }) => {
                            const total = cells.reduce((s, c) => s + c.assigned, 0);
                            return (_jsxs("tr", { className: "border-b hrule last:border-b-0", children: [_jsx("td", { className: "cell-pad font-medium", children: trainer }), cells.map((c, i) => {
                                        const intensity = c.assigned / max;
                                        return (_jsx("td", { className: "cell-pad text-center", title: `Batch ${BATCHES[i]}: ${c.delivered}/${c.assigned} delivered`, children: c.assigned === 0
                                                ? _jsx("span", { className: "text-muted dark:text-muted-dark", children: "\u00B7" })
                                                : (_jsxs("span", { className: "inline-flex items-center justify-center num font-medium h-7 w-12", style: { background: `rgba(13, 148, 136, ${0.1 + intensity * 0.65})`, color: intensity > 0.5 ? '#fff' : 'currentColor' }, children: [c.delivered, "/", c.assigned] })) }, i));
                                    }), _jsx("td", { className: "cell-pad text-right num font-semibold", children: total })] }, trainer));
                        }) })] }) }) }));
}
function ZoneRollup({ ds }) {
    const rows = useMemo(() => {
        return BATCHES.map(b => {
            const emps = ds.employees.filter(e => e.batch === b);
            const zone = ZONE_BY_BATCH[b].zone;
            const active = emps.filter(e => e.isActive).length;
            const att = ds.attendance.filter(a => a.batch === b && (a.status === 'present' || a.status === 'absent'));
            const present = att.filter(a => a.status === 'present').length;
            const pct = att.length === 0 ? null : Math.round((present / att.length) * 1000) / 10;
            const scored = ds.assessments.filter(a => emps.some(e => e.email === a.email) && a.score != null);
            const avg = scored.length === 0 ? null
                : Math.round((scored.reduce((s, x) => s + x.score, 0) / scored.length) * 10) / 10;
            const done = ds.batchSessions.filter(x => x.batch === b && x.status === 'completed' && x.sessionNumber <= TOTAL_TRAINING_SESSIONS).length;
            const zm = emps.find(e => e.role === 'ZM');
            return { batch: b, zone, active, pct, avg, done, zm: zm?.name ?? null };
        });
    }, [ds]);
    return (_jsx(Section, { title: "Zone Rollup", hint: _jsx(InfoTip, { children: "Per batch: team size, sessions done, attendance %, avg score, ZM." }), children: _jsx("div", { className: "border hrule", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "label-xs border-b hrule text-left", children: [_jsx("th", { className: "cell-pad font-normal w-[5%]", children: "B" }), _jsx("th", { className: "cell-pad font-normal", children: "Zone" }), _jsx("th", { className: "cell-pad font-normal w-[8%] text-right", children: "Team" }), _jsx("th", { className: "cell-pad font-normal w-[8%] text-right", children: "Done" }), _jsx("th", { className: "cell-pad font-normal w-[10%] text-right", children: "Att%" }), _jsx("th", { className: "cell-pad font-normal w-[10%] text-right", children: "Avg" }), _jsx("th", { className: "cell-pad font-normal w-[20%]", children: "ZM" })] }) }), _jsx("tbody", { children: rows.map(r => (_jsxs("tr", { className: "border-b hrule last:border-b-0", children: [_jsx("td", { className: "cell-pad num font-semibold", children: r.batch }), _jsx("td", { className: "cell-pad", children: r.zone }), _jsx("td", { className: "cell-pad text-right num", children: r.active }), _jsxs("td", { className: "cell-pad text-right num", children: [r.done, "/", TOTAL_TRAINING_SESSIONS] }), _jsx("td", { className: "cell-pad text-right", children: _jsx(PctCell, { value: r.pct }) }), _jsx("td", { className: "cell-pad text-right", children: _jsx(ScoreCell, { score: r.avg, band: bandOf(r.avg) }) }), _jsx("td", { className: "cell-pad text-[12px] text-muted dark:text-muted-dark", children: r.zm ?? _jsx("span", { className: "italic", children: "none" }) })] }, r.batch))) })] }) }) }));
}
function RMSummary({ ds }) {
    const zmIdx = buildZmIndex(ds);
    const rows = useMemo(() => {
        const map = new Map();
        for (const e of ds.employees) {
            const key = zmFor(e, zmIdx);
            const m = map.get(key) ?? { size: 0, attTotal: 0, attHeld: 0, scoreSum: 0, scoreCnt: 0, atRisk: 0 };
            m.size++;
            const att = ds.attendance.filter(a => a.email === e.email && (a.status === 'present' || a.status === 'absent'));
            const present = att.filter(a => a.status === 'present').length;
            const missed = att.filter(a => a.status === 'absent').length;
            m.attHeld += att.length;
            m.attTotal += present;
            const scores = ds.assessments.filter(a => a.email === e.email && a.score != null);
            m.scoreSum += scores.reduce((s, x) => s + x.score, 0);
            m.scoreCnt += scores.length;
            const badAny = scores.some(s => s.score <= 2);
            if (e.isActive && (badAny || missed >= 2))
                m.atRisk++;
            map.set(key, m);
        }
        return Array.from(map.entries()).map(([zm, m]) => ({
            rm: zm, size: m.size,
            attPct: m.attHeld === 0 ? null : Math.round((m.attTotal / m.attHeld) * 1000) / 10,
            avgScore: m.scoreCnt === 0 ? null : Math.round((m.scoreSum / m.scoreCnt) * 10) / 10,
            atRisk: m.atRisk,
        })).sort((a, b) => (a.attPct ?? -1) - (b.attPct ?? -1));
    }, [ds]);
    return (_jsx(Section, { title: "ZM Summary", hint: _jsx(InfoTip, { children: "Per ZM (Reporting Manager): team size, attendance, avg score, at-risk. Inherits the ZM across the zone (e.g. MP/MAHA Batches 4 + 5 share Don Bosco)." }), children: _jsx("div", { className: "border hrule", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: "cell-pad th-bold text-left", children: "ZM" }), _jsx("th", { className: "cell-pad th-bold text-right w-[10%]", children: "Team" }), _jsx("th", { className: "cell-pad th-bold text-right w-[12%]", children: "Att%" }), _jsx("th", { className: "cell-pad th-bold text-right w-[12%]", children: "Avg" }), _jsx("th", { className: "cell-pad th-bold text-right w-[12%]", children: "At Risk" })] }) }), _jsx("tbody", { children: rows.map(r => (_jsxs("tr", { className: "border-b hrule last:border-b-0", children: [_jsx("td", { className: "cell-pad", children: r.rm.startsWith('Unassigned')
                                        ? _jsx("span", { className: "italic text-muted dark:text-muted-dark", children: r.rm })
                                        : _jsx("span", { className: "font-medium", children: r.rm }) }), _jsx("td", { className: "cell-pad text-right num", children: r.size }), _jsx("td", { className: "cell-pad text-right", children: _jsx(PctCell, { value: r.attPct }) }), _jsx("td", { className: "cell-pad text-right", children: _jsx(ScoreCell, { score: r.avgScore, band: bandOf(r.avgScore) }) }), _jsx("td", { className: "cell-pad text-right num", children: r.atRisk > 0 ? _jsx("span", { className: "text-bad font-semibold", children: r.atRisk }) : _jsx("span", { className: "text-muted dark:text-muted-dark", children: "0" }) })] }, r.rm))) })] }) }) }));
}
