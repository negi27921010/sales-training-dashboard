import { useMemo, useState } from 'react';
import { Dataset } from '../lib/derive';
import { BATCHES, TOTAL_TRAINING_SESSIONS, ZONE_BY_BATCH, BAND_COLOR, bandOf } from '../types';
import { buildZmIndex, zmFor } from '../lib/zm';
import { InfoTip } from '../components/Tooltip';
import { Empty, PctCell, ScoreCell, Section } from '../components/Atoms';

// ─── Time model — overridable assumptions ──────────────────────────────────
const DEFAULT_TIME_MODEL = {
  workdayHours: 8,
  trainer: {
    sessionPrepHours:        1.0,   // per session per trainer-batch
    sessionDeliveryHours:    2.0,   // per session per trainer-batch
    assessmentCreationHours: 1.5,   // per session (one-off across batches)
    assessmentPerEmployee:   0.25,  // per assessed employee
  },
  salesperson: {
    preReadHours:        0.5,   // per session attended
    sessionAttendance:   2.0,   // per session attended
    assessmentTaking:    0.5,   // per session attended where they were assessed
    postReadHours:       0.5,   // per session attended
  },
};
type TimeModel = typeof DEFAULT_TIME_MODEL;

export function CapacityOps({ ds }: { ds: Dataset }) {
  const [model, setModel] = useState<TimeModel>(DEFAULT_TIME_MODEL);

  return (
    <div className="flex flex-col gap-6">
      <CapacityHeadline ds={ds} model={model} />
      <TimeAssumptions model={model} onChange={setModel} />
      <TrainerTimeUtilization ds={ds} model={model} />
      <SalespersonTimeUtilization ds={ds} model={model} />
      <TrainerXBatch ds={ds} />
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-6"><ZoneRollup ds={ds} /></div>
        <div className="col-span-6"><RMSummary ds={ds} /></div>
      </div>
    </div>
  );
}

// ─── Headline numbers ──────────────────────────────────────────────────────
function CapacityHeadline({ ds, model }: { ds: Dataset; model: TimeModel }) {
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

  return (
    <Section title="Capacity Headline"
      hint={<InfoTip>Sessions and hours invested. The Time Assumptions block below feeds these numbers — change a value there to see this update.</InfoTip>}>
      <div className="grid grid-cols-4 divide-x hrule border-y hrule">
        <Big label="Trainer Slots" value={`${stats.slotsDelivered} / ${stats.slotsAssigned}`}
          sub={`of ${stats.totalSlots} total (${stats.trainerCount} trainers × ${TOTAL_TRAINING_SESSIONS} sessions × ${BATCHES.length} batches)`} />
        <Big label="Trainer Hours" value={`${stats.trainerHours} h`}
          sub={`≈ ${stats.trainerWorkdays} workdays (${model.workdayHours}h day)`} />
        <Big label="Salesperson Hours" value={`${stats.salespersonHours} h`}
          sub={`across ${stats.activeCount} active people`} />
        <Big label="Avg Hours / Salesperson" value={`${stats.activeCount ? (stats.salespersonHours / stats.activeCount).toFixed(1) : '—'} h`}
          sub={`≈ ${(stats.salespersonHours / stats.activeCount / model.workdayHours).toFixed(2)} workdays each`} />
      </div>
    </Section>
  );
}

function Big({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="px-4 py-4 flex flex-col gap-1">
      <div className="label-xs">{label}</div>
      <div className="num text-2xl font-semibold">{value}</div>
      <div className="text-[11px] text-muted dark:text-muted-dark">{sub}</div>
    </div>
  );
}

// ─── Editable time assumptions ─────────────────────────────────────────────
function TimeAssumptions({ model, onChange }: { model: TimeModel; onChange: (m: TimeModel) => void }) {
  const [open, setOpen] = useState(false);

  const set = (path: string, v: number) => {
    const next = JSON.parse(JSON.stringify(model)) as TimeModel;
    const parts = path.split('.');
    let cur: any = next;
    for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
    cur[parts[parts.length - 1]] = v;
    onChange(next);
  };

  return (
    <Section
      title="Time Assumptions"
      hint={<InfoTip>
        Every hour figure on this page comes from these per-activity estimates.
        Tune them as your team's real cadence becomes clearer; the page
        recomputes live.
      </InfoTip>}
      right={
        <button className="btn-ghost" onClick={() => setOpen(!open)}>
          {open ? 'COLLAPSE' : 'EDIT'}
        </button>
      }
    >
      {open ? (
        <div className="border hrule p-4 grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <div>
            <div className="label-xs mb-2">Trainer time per activity (hours)</div>
            <Field label="Session prep"            value={model.trainer.sessionPrepHours}        onChange={v => set('trainer.sessionPrepHours', v)} />
            <Field label="Session delivery"        value={model.trainer.sessionDeliveryHours}    onChange={v => set('trainer.sessionDeliveryHours', v)} />
            <Field label="Assessment creation"     value={model.trainer.assessmentCreationHours} onChange={v => set('trainer.assessmentCreationHours', v)} />
            <Field label="Per-employee assessment" value={model.trainer.assessmentPerEmployee}   onChange={v => set('trainer.assessmentPerEmployee', v)} />
          </div>
          <div>
            <div className="label-xs mb-2">Salesperson time per attended session (hours)</div>
            <Field label="Pre-read"          value={model.salesperson.preReadHours}      onChange={v => set('salesperson.preReadHours', v)} />
            <Field label="Session attendance" value={model.salesperson.sessionAttendance} onChange={v => set('salesperson.sessionAttendance', v)} />
            <Field label="Assessment taking" value={model.salesperson.assessmentTaking}  onChange={v => set('salesperson.assessmentTaking', v)} />
            <Field label="Post-read"          value={model.salesperson.postReadHours}     onChange={v => set('salesperson.postReadHours', v)} />
            <Field label="Workday hours"     value={model.workdayHours}                  onChange={v => set('workdayHours', v)} />
          </div>
        </div>
      ) : (
        <div className="border hrule px-4 py-3 text-[12px] text-muted dark:text-muted-dark grid grid-cols-2 gap-x-8">
          <div>
            <b className="text-ink dark:text-ink-dark">Trainer:</b> prep {model.trainer.sessionPrepHours}h · delivery {model.trainer.sessionDeliveryHours}h · creation {model.trainer.assessmentCreationHours}h · per-employee assess {model.trainer.assessmentPerEmployee}h
          </div>
          <div>
            <b className="text-ink dark:text-ink-dark">Salesperson / session:</b> pre-read {model.salesperson.preReadHours}h · session {model.salesperson.sessionAttendance}h · assess {model.salesperson.assessmentTaking}h · post-read {model.salesperson.postReadHours}h · {model.workdayHours}h workday
          </div>
        </div>
      )}
    </Section>
  );
}

function Field({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 py-1">
      <span className="text-[12px]">{label}</span>
      <input
        type="number" min={0} step={0.25}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className="num w-20 bg-transparent border hrule px-2 py-1 text-right text-[12px] outline-none focus:ring-1 focus:ring-accent"
      />
    </label>
  );
}

// ─── Trainer time utilization (stacked bar) ────────────────────────────────
function TrainerTimeUtilization({ ds, model }: { ds: Dataset; model: TimeModel }) {
  const rows = useMemo(() => {
    const trainers = Array.from(new Set(ds.batchSessions.map(b => b.trainerName).filter(Boolean) as string[]));
    return trainers.map(t => {
      const delivered = ds.batchSessions.filter(
        b => b.trainerName === t && b.status === 'completed' && b.sessionNumber <= TOTAL_TRAINING_SESSIONS,
      );
      const sessionsWithAssessment = new Set(delivered.map(d => d.sessionNumber));
      const assessmentsPushed = ds.assessments.filter(a =>
        a.score != null
        && delivered.some(d => d.sessionNumber === a.sessionNumber)
        && ds.employees.some(e => e.email === a.email && delivered.some(d => d.batch === e.batch))
      ).length;

      const prep      = delivered.length * model.trainer.sessionPrepHours;
      const delivery  = delivered.length * model.trainer.sessionDeliveryHours;
      const creation  = sessionsWithAssessment.size * model.trainer.assessmentCreationHours;
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

  if (rows.length === 0) return <Empty message="No completed sessions yet." />;
  const max = Math.max(...rows.map(r => r.total), 1);

  return (
    <Section
      title="Trainer Time Utilization"
      hint={<InfoTip>
        Hours each trainer has spent across the four activities. The bar shows
        the mix; the number on the right is total hours and workday
        equivalents.
      </InfoTip>}
    >
      <div className="border hrule">
        <table className="w-full text-sm">
          <thead>
            <tr className="label-xs border-b hrule text-left">
              <th className="cell-pad font-normal w-[15%]">Trainer</th>
              <th className="cell-pad font-normal w-[10%] text-right">Sessions</th>
              <th className="cell-pad font-normal w-[40%]">Time Breakdown</th>
              <th className="cell-pad font-normal w-[8%] text-right">Prep</th>
              <th className="cell-pad font-normal w-[8%] text-right">Deliver</th>
              <th className="cell-pad font-normal w-[8%] text-right">Create</th>
              <th className="cell-pad font-normal w-[8%] text-right">Assess</th>
              <th className="cell-pad font-normal w-[10%] text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.trainer} className="border-b hrule last:border-b-0">
                <td className="cell-pad font-medium">{r.trainer}</td>
                <td className="cell-pad text-right num">{r.sessionsDelivered}</td>
                <td className="cell-pad">
                  <StackedBar
                    segments={[
                      { v: r.prep,      cls: 'bg-ink/30 dark:bg-ink-dark/30', label: 'prep' },
                      { v: r.delivery,  cls: 'bg-ink dark:bg-ink-dark',       label: 'delivery' },
                      { v: r.creation,  cls: 'bg-accent',                     label: 'creation' },
                      { v: r.assessing, cls: 'bg-accent/50',                  label: 'assessing' },
                    ]}
                    max={max}
                  />
                </td>
                <td className="cell-pad text-right num text-[12px]">{r.prep.toFixed(1)}h</td>
                <td className="cell-pad text-right num text-[12px]">{r.delivery.toFixed(1)}h</td>
                <td className="cell-pad text-right num text-[12px]">{r.creation.toFixed(1)}h</td>
                <td className="cell-pad text-right num text-[12px]">{r.assessing.toFixed(1)}h</td>
                <td className="cell-pad text-right num">
                  <div className="font-semibold">{r.total.toFixed(1)}h</div>
                  <div className="text-[10px] text-muted dark:text-muted-dark">{r.workdays.toFixed(2)} days</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Legend items={[
          { cls: 'bg-ink/30 dark:bg-ink-dark/30', label: 'Prep' },
          { cls: 'bg-ink dark:bg-ink-dark', label: 'Delivery' },
          { cls: 'bg-accent', label: 'Assessment creation' },
          { cls: 'bg-accent/50', label: 'Assessment conduction' },
        ]} />
      </div>
    </Section>
  );
}

// ─── Salesperson time utilization ──────────────────────────────────────────
function SalespersonTimeUtilization({ ds, model }: { ds: Dataset; model: TimeModel }) {
  const rows = useMemo(() => {
    return ds.employees.filter(e => e.isActive).map(e => {
      const attendedSessions = ds.attendance.filter(
        a => a.email === e.email && a.status === 'present' && a.sessionNumber <= TOTAL_TRAINING_SESSIONS,
      );
      const assessedSessions = new Set(
        ds.assessments.filter(a => a.email === e.email && a.score != null).map(a => a.sessionNumber),
      );
      const preRead   = attendedSessions.length * model.salesperson.preReadHours;
      const session   = attendedSessions.length * model.salesperson.sessionAttendance;
      const assessing = attendedSessions.filter(a => assessedSessions.has(a.sessionNumber)).length * model.salesperson.assessmentTaking;
      const postRead  = attendedSessions.length * model.salesperson.postReadHours;
      const total = preRead + session + assessing + postRead;
      const avgScored = ds.assessments.filter(a => a.email === e.email && a.score != null);
      const avg = avgScored.length === 0 ? null
        : Math.round((avgScored.reduce((s, x) => s + (x.score as number), 0) / avgScored.length) * 10) / 10;
      return {
        emp: e,
        attended: attendedSessions.length,
        preRead, session, assessing, postRead, total,
        workdays: total / model.workdayHours,
        avgScore: avg,
      };
    }).sort((a, b) => b.total - a.total);
  }, [ds, model]);

  if (rows.length === 0) return null;
  const max = Math.max(...rows.map(r => r.total), 1);

  return (
    <Section
      title="Salesperson Time Utilization"
      hint={<InfoTip>
        Hours each salesperson has invested across pre-read, sitting in
        sessions, taking assessments, and post-read. Sorted by total hours
        spent.
      </InfoTip>}
      right={`${rows.length} active people`}
    >
      <div className="border hrule overflow-auto" style={{ maxHeight: 520 }}>
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-bg dark:bg-bg-dark z-10">
            <tr className="label-xs border-b hrule text-left">
              <th className="cell-pad font-normal sticky left-0 bg-bg dark:bg-bg-dark w-[20%]">Employee</th>
              <th className="cell-pad font-normal w-[5%]">B</th>
              <th className="cell-pad font-normal w-[7%] text-right">Attended</th>
              <th className="cell-pad font-normal w-[34%]">Time Breakdown</th>
              <th className="cell-pad font-normal w-[7%] text-right">Pre</th>
              <th className="cell-pad font-normal w-[7%] text-right">Session</th>
              <th className="cell-pad font-normal w-[7%] text-right">Assess</th>
              <th className="cell-pad font-normal w-[7%] text-right">Post</th>
              <th className="cell-pad font-normal w-[9%] text-right">Total</th>
              <th className="cell-pad font-normal w-[7%] text-right">Avg</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.emp.email} className="border-b hrule last:border-b-0 hover:bg-ink/[0.02] dark:hover:bg-ink-dark/[0.04]">
                <td className="cell-pad sticky left-0 bg-bg dark:bg-bg-dark font-medium">{r.emp.name}</td>
                <td className="cell-pad num">{r.emp.batch}</td>
                <td className="cell-pad text-right num">{r.attended}</td>
                <td className="cell-pad">
                  <StackedBar
                    segments={[
                      { v: r.preRead,   cls: 'bg-accent/30',                  label: 'pre' },
                      { v: r.session,   cls: 'bg-ink dark:bg-ink-dark',       label: 'session' },
                      { v: r.assessing, cls: 'bg-accent',                     label: 'assess' },
                      { v: r.postRead,  cls: 'bg-accent/50',                  label: 'post' },
                    ]}
                    max={max}
                  />
                </td>
                <td className="cell-pad text-right num text-[11px]">{r.preRead.toFixed(1)}</td>
                <td className="cell-pad text-right num text-[11px]">{r.session.toFixed(1)}</td>
                <td className="cell-pad text-right num text-[11px]">{r.assessing.toFixed(1)}</td>
                <td className="cell-pad text-right num text-[11px]">{r.postRead.toFixed(1)}</td>
                <td className="cell-pad text-right num">
                  <div className="font-semibold">{r.total.toFixed(1)}h</div>
                  <div className="text-[10px] text-muted dark:text-muted-dark">{r.workdays.toFixed(2)}d</div>
                </td>
                <td className="cell-pad text-right">
                  {r.avgScore == null ? <span className="text-muted dark:text-muted-dark">—</span>
                    : <span style={{ color: BAND_COLOR[bandOf(r.avgScore)!] }} className="num">{r.avgScore.toFixed(1)}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Legend items={[
          { cls: 'bg-accent/30', label: 'Pre-read' },
          { cls: 'bg-ink dark:bg-ink-dark', label: 'Session attendance' },
          { cls: 'bg-accent', label: 'Assessment taking' },
          { cls: 'bg-accent/50', label: 'Post-read' },
        ]} />
      </div>
    </Section>
  );
}

function StackedBar({ segments, max }: { segments: { v: number; cls: string; label: string }[]; max: number }) {
  const total = segments.reduce((s, x) => s + x.v, 0);
  const pct = (n: number) => (max === 0 ? 0 : (n / max) * 100);
  return (
    <div className="flex h-3 w-full" title={`Total ${total.toFixed(1)}h`}>
      {segments.map((s, i) => (
        <div key={i} className={s.cls} style={{ width: `${pct(s.v)}%` }} title={`${s.label}: ${s.v.toFixed(1)}h`} />
      ))}
    </div>
  );
}

function Legend({ items }: { items: { cls: string; label: string }[] }) {
  return (
    <div className="flex items-center gap-4 px-4 py-2 border-t hrule text-[10px] text-muted dark:text-muted-dark">
      {items.map((it, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          <span className={`inline-block h-2 w-3 ${it.cls}`} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

// ─── Trainer × Batch matrix (unchanged) ────────────────────────────────────
function TrainerXBatch({ ds }: { ds: Dataset }) {
  const trainers = useMemo(
    () => Array.from(new Set(ds.batchSessions.map(b => b.trainerName).filter(Boolean) as string[])).sort(),
    [ds],
  );
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

  if (trainers.length === 0) return null;
  const max = Math.max(...matrix.flatMap(m => m.cells.map(c => c.assigned)), 1);

  return (
    <Section
      title="Trainer × Batch Concentration"
      hint={<InfoTip>Darker = more sessions for that (trainer, batch) pair. Cell shows delivered / assigned.</InfoTip>}
    >
      <div className="border hrule overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="label-xs border-b hrule text-left">
              <th className="cell-pad font-normal w-[20%]">Trainer</th>
              {BATCHES.map(b => (
                <th key={b} className="cell-pad font-normal text-center">
                  <div>BATCH {b}</div>
                  <div className="text-[10px] text-muted dark:text-muted-dark normal-case">{ZONE_BY_BATCH[b].zone}</div>
                </th>
              ))}
              <th className="cell-pad font-normal text-right w-[10%]">Total</th>
            </tr>
          </thead>
          <tbody>
            {matrix.map(({ trainer, cells }) => {
              const total = cells.reduce((s, c) => s + c.assigned, 0);
              return (
                <tr key={trainer} className="border-b hrule last:border-b-0">
                  <td className="cell-pad font-medium">{trainer}</td>
                  {cells.map((c, i) => {
                    const intensity = c.assigned / max;
                    return (
                      <td key={i} className="cell-pad text-center" title={`Batch ${BATCHES[i]}: ${c.delivered}/${c.assigned} delivered`}>
                        {c.assigned === 0
                          ? <span className="text-muted dark:text-muted-dark">·</span>
                          : (
                            <span className="inline-flex items-center justify-center num font-medium h-7 w-12"
                              style={{ background: `rgba(13, 148, 136, ${0.1 + intensity * 0.65})`, color: intensity > 0.5 ? '#fff' : 'currentColor' }}>
                              {c.delivered}/{c.assigned}
                            </span>
                          )}
                      </td>
                    );
                  })}
                  <td className="cell-pad text-right num font-semibold">{total}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function ZoneRollup({ ds }: { ds: Dataset }) {
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
        : Math.round((scored.reduce((s, x) => s + (x.score as number), 0) / scored.length) * 10) / 10;
      const done = ds.batchSessions.filter(x => x.batch === b && x.status === 'completed' && x.sessionNumber <= TOTAL_TRAINING_SESSIONS).length;
      const zm = emps.find(e => e.role === 'ZM');
      return { batch: b, zone, active, pct, avg, done, zm: zm?.name ?? null };
    });
  }, [ds]);

  return (
    <Section title="Zone Rollup"
      hint={<InfoTip>Per batch: team size, sessions done, attendance %, avg score, ZM.</InfoTip>}>
      <div className="border hrule">
        <table className="w-full text-sm">
          <thead>
            <tr className="label-xs border-b hrule text-left">
              <th className="cell-pad font-normal w-[5%]">B</th>
              <th className="cell-pad font-normal">Zone</th>
              <th className="cell-pad font-normal w-[8%] text-right">Team</th>
              <th className="cell-pad font-normal w-[8%] text-right">Done</th>
              <th className="cell-pad font-normal w-[10%] text-right">Att%</th>
              <th className="cell-pad font-normal w-[10%] text-right">Avg</th>
              <th className="cell-pad font-normal w-[20%]">ZM</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.batch} className="border-b hrule last:border-b-0">
                <td className="cell-pad num font-semibold">{r.batch}</td>
                <td className="cell-pad">{r.zone}</td>
                <td className="cell-pad text-right num">{r.active}</td>
                <td className="cell-pad text-right num">{r.done}/{TOTAL_TRAINING_SESSIONS}</td>
                <td className="cell-pad text-right"><PctCell value={r.pct} /></td>
                <td className="cell-pad text-right"><ScoreCell score={r.avg} band={bandOf(r.avg)} /></td>
                <td className="cell-pad text-[12px] text-muted dark:text-muted-dark">{r.zm ?? <span className="italic">none</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function RMSummary({ ds }: { ds: Dataset }) {
  const zmIdx = buildZmIndex(ds);
  const rows = useMemo(() => {
    const map = new Map<string, { size: number; attTotal: number; attHeld: number; scoreSum: number; scoreCnt: number; atRisk: number }>();
    for (const e of ds.employees) {
      const key = zmFor(e, zmIdx);
      const m = map.get(key) ?? { size: 0, attTotal: 0, attHeld: 0, scoreSum: 0, scoreCnt: 0, atRisk: 0 };
      m.size++;
      const att = ds.attendance.filter(a => a.email === e.email && (a.status === 'present' || a.status === 'absent'));
      const present = att.filter(a => a.status === 'present').length;
      const missed  = att.filter(a => a.status === 'absent').length;
      m.attHeld  += att.length;
      m.attTotal += present;
      const scores = ds.assessments.filter(a => a.email === e.email && a.score != null);
      m.scoreSum += scores.reduce((s, x) => s + (x.score as number), 0);
      m.scoreCnt += scores.length;
      const badAny = scores.some(s => (s.score as number) <= 2);
      if (e.isActive && (badAny || missed >= 2)) m.atRisk++;
      map.set(key, m);
    }
    return Array.from(map.entries()).map(([zm, m]) => ({
      rm: zm, size: m.size,
      attPct: m.attHeld === 0 ? null : Math.round((m.attTotal / m.attHeld) * 1000) / 10,
      avgScore: m.scoreCnt === 0 ? null : Math.round((m.scoreSum / m.scoreCnt) * 10) / 10,
      atRisk: m.atRisk,
    })).sort((a, b) => (a.attPct ?? -1) - (b.attPct ?? -1));
  }, [ds]);

  return (
    <Section title="ZM Summary"
      hint={<InfoTip>Per ZM (Reporting Manager): team size, attendance, avg score, at-risk. Inherits the ZM across the zone (e.g. MP/MAHA Batches 4 + 5 share Don Bosco).</InfoTip>}>
      <div className="border hrule">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="cell-pad th-bold text-left">ZM</th>
              <th className="cell-pad th-bold text-right w-[10%]">Team</th>
              <th className="cell-pad th-bold text-right w-[12%]">Att%</th>
              <th className="cell-pad th-bold text-right w-[12%]">Avg</th>
              <th className="cell-pad th-bold text-right w-[12%]">At Risk</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.rm} className="border-b hrule last:border-b-0">
                <td className="cell-pad">
                  {r.rm.startsWith('Unassigned')
                    ? <span className="italic text-muted dark:text-muted-dark">{r.rm}</span>
                    : <span className="font-medium">{r.rm}</span>}
                </td>
                <td className="cell-pad text-right num">{r.size}</td>
                <td className="cell-pad text-right"><PctCell value={r.attPct} /></td>
                <td className="cell-pad text-right"><ScoreCell score={r.avgScore} band={bandOf(r.avgScore)} /></td>
                <td className="cell-pad text-right num">
                  {r.atRisk > 0 ? <span className="text-bad font-semibold">{r.atRisk}</span> : <span className="text-muted dark:text-muted-dark">0</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
