import { useMemo, useState } from 'react';
import { Dataset } from '../lib/derive';
import { Status, TOTAL_TRAINING_SESSIONS } from '../types';
import { InfoTip } from '../components/Tooltip';
import { Empty, PctCell, Section, TH, useSort } from '../components/Atoms';
import {
  RetrainingAction, upsertAction, removeAction, retrainingId, useActions,
} from '../lib/actions';
import { DefaulterIntel, MissedSessionItem, buildDefaulterIntel } from '../lib/intelligence';
import { buildZmIndex, zmFor } from '../lib/zm';

export function AttendanceIntelligence({ ds, onPickEmployee }: {
  ds: Dataset;
  onPickEmployee: (email: string) => void;
}) {
  const actions = useActions();
  const zmIdx = useMemo(() => buildZmIndex(ds), [ds]);
  const intel = useMemo(() => buildDefaulterIntel(ds, actions), [ds, actions]);
  // Inject resolved ZM into each intel row so it's filterable/sortable
  const intelWithZm = useMemo(() => intel.map(i => {
    const emp = ds.employees.find(e => e.email === i.email);
    return { ...i, zm: emp ? zmFor(emp, zmIdx) : 'Unassigned' };
  }), [intel, ds, zmIdx]);

  return (
    <div className="flex flex-col gap-6">
      <KPIs ds={ds} intel={intel} />
      <RetrainingIntelligence intel={intelWithZm} zmIdx={zmIdx} onPickEmployee={onPickEmployee} />
      <AttendanceHeatmap ds={ds} zmIdx={zmIdx} onPickEmployee={onPickEmployee} />
    </div>
  );
}

// ─── KPI cards top ─────────────────────────────────────────────────────────
function KPIs({ ds, intel }: { ds: Dataset; intel: DefaulterIntel[] }) {
  const stats = useMemo(() => {
    const all = ds.attendance.filter(
      a => a.sessionNumber <= TOTAL_TRAINING_SESSIONS && (a.status === 'present' || a.status === 'absent'),
    );
    const present = all.filter(a => a.status === 'present').length;
    const absent  = all.filter(a => a.status === 'absent').length;
    const pct = all.length === 0 ? 0 : Math.round((present / all.length) * 1000) / 10;
    const chronic = intel.filter(i => i.riskLabel === 'CHRONIC').length;
    const atRisk  = intel.filter(i => i.riskLabel === 'AT RISK').length;
    const unscheduled = intel.reduce((s, x) => s + x.totalUnscheduled, 0);
    return { all: all.length, present, absent, pct, chronic, atRisk, unscheduled };
  }, [ds, intel]);

  const cards = [
    { label: 'Overall Attendance',  value: `${stats.pct.toFixed(1)}%`, sub: `${stats.present} of ${stats.all} cells = YES`,
      tone: stats.pct < 70 ? 'bad' : stats.pct < 85 ? 'avg' : 'great',
      tip: 'YES marks ÷ (YES + NO) across every employee × every held session.' },
    { label: 'Total Absences',  value: `${stats.absent}`, sub: `${intel.length} unique employees affected`,
      tone: stats.absent > 0 ? 'bad' : 'great',
      tip: 'Every cell marked NO in the attendance sheet for sessions held so far.' },
    { label: 'Unscheduled Retraining',  value: `${stats.unscheduled}`, sub: 'absences with no make-up plan',
      tone: stats.unscheduled > 0 ? 'bad' : 'great',
      tip: 'Absences where no retraining slot has been assigned. Each is an action item.' },
    { label: 'Chronic Defaulters', value: `${stats.chronic}`, sub: `${stats.atRisk} more at-risk`,
      tone: stats.chronic > 0 ? 'bad' : stats.atRisk > 0 ? 'avg' : 'great',
      tip: 'CHRONIC = 2+ no-shows after rescheduling, or risk score ≥ 200.' },
  ];

  return (
    <section className="grid grid-cols-1 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x hrule border-y hrule">
      {cards.map(c => (
        <div key={c.label} className="px-4 py-4 flex flex-col gap-1">
          <div className="label-xs flex items-center">{c.label}<InfoTip>{c.tip}</InfoTip></div>
          <div className="flex items-baseline gap-2">
            <div className="num text-3xl font-semibold">{c.value}</div>
            <span className={`inline-block w-1.5 h-1.5 rounded-full
              ${c.tone === 'bad' ? 'bg-bad' : c.tone === 'avg' ? 'bg-avg' : 'bg-great'}`} />
          </div>
          <div className="text-[11px] text-muted dark:text-muted-dark">{c.sub}</div>
        </div>
      ))}
    </section>
  );
}

// ─── Retraining intelligence ───────────────────────────────────────────────
type IntelWithZm = DefaulterIntel & { zm: string };

function RetrainingIntelligence({ intel, zmIdx, onPickEmployee }: {
  intel: IntelWithZm[]; zmIdx: ReturnType<typeof buildZmIndex>;
  onPickEmployee: (email: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [riskFilter, setRiskFilter] = useState<'all' | 'CHRONIC' | 'AT RISK' | 'WATCH'>('all');
  const [zmFilter, setZmFilter] = useState<string>('all');

  const filtered = useMemo(() => intel.filter(d => {
    if (riskFilter !== 'all' && d.riskLabel !== riskFilter) return false;
    if (zmFilter !== 'all' && d.zm !== zmFilter) return false;
    return true;
  }), [intel, riskFilter, zmFilter]);

  const { sorted, sortKey, sortDir, toggle: toggleSort } = useSort(filtered, { key: 'riskScore', dir: 'desc' });

  const toggle = (k: string) => {
    const next = new Set(expanded);
    next.has(k) ? next.delete(k) : next.add(k);
    setExpanded(next);
  };

  if (intel.length === 0) {
    return <Section title="Retraining Tracker"><Empty message="No absences. Nothing to reschedule." /></Section>;
  }

  return (
    <Section
      title="Retraining Tracker"
      hint={<InfoTip>
        One row per <b>person</b>. Click to see every session they missed and
        either assign them to a future batch running the same session, or mark
        whether they showed up. Action history persists locally.
      </InfoTip>}
      right={
        <span className="inline-flex items-center gap-3 flex-wrap">
          <FilterChip label="Risk" value={riskFilter} options={['all', 'CHRONIC', 'AT RISK', 'WATCH']} onChange={v => setRiskFilter(v as any)} />
          <FilterChip label="ZM"   value={zmFilter}   options={['all', ...zmIdx.list]} onChange={setZmFilter} />
          <span className="num">{filtered.length} / {intel.length}</span>
        </span>
      }
    >
      <div className="border hrule">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <TH align="center" className="w-[3%]"> </TH>
              <TH sortKey="name" current={sortKey} dir={sortDir} onToggle={toggleSort} className="w-[24%]">Employee</TH>
              <TH sortKey="batch" current={sortKey} dir={sortDir} onToggle={toggleSort} align="right" className="w-[7%]">Batch</TH>
              <TH sortKey="totalMissed" current={sortKey} dir={sortDir} onToggle={toggleSort} align="right" className="w-[8%]">Missed</TH>
              <TH sortKey="totalUnscheduled" current={sortKey} dir={sortDir} onToggle={toggleSort} align="right" className="w-[12%]">Unscheduled</TH>
              <TH sortKey="totalDefaulted" current={sortKey} dir={sortDir} onToggle={toggleSort} align="right" className="w-[10%]">No-Shows</TH>
              <TH sortKey="riskLabel" current={sortKey} dir={sortDir} onToggle={toggleSort} className="w-[12%]">Risk</TH>
              <TH sortKey="zm" current={sortKey} dir={sortDir} onToggle={toggleSort}>ZM</TH>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr><td colSpan={8} className="cell-pad text-center text-muted dark:text-muted-dark py-6">No defaulters match the current filters.</td></tr>
            )}
            {sorted.map(d => (
              <DefaulterRow
                key={d.email}
                d={d}
                isOpen={expanded.has(d.email)}
                onToggle={() => toggle(d.email)}
                onPickEmployee={onPickEmployee}
              />
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function FilterChip({ label, value, options, onChange }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void;
}) {
  return (
    <label className="inline-flex items-center gap-1.5 text-[11px]">
      <span className="label-xs">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="bg-transparent border hrule px-1.5 py-1 text-[11px] font-mono outline-none focus:ring-1 focus:ring-accent max-w-[160px]"
      >
        {options.map(o => <option key={o} value={o}>{o === 'all' ? 'All' : o}</option>)}
      </select>
    </label>
  );
}

function DefaulterRow({ d, isOpen, onToggle, onPickEmployee }: {
  d: IntelWithZm; isOpen: boolean; onToggle: () => void; onPickEmployee: (email: string) => void;
}) {
  const riskCls = d.riskLabel === 'CHRONIC' ? 'bg-bad text-bg dark:text-bg-dark'
                : d.riskLabel === 'AT RISK' ? 'bg-bad/10 text-bad border border-bad/40'
                : d.riskLabel === 'WATCH'   ? 'bg-avg/10 text-avg border border-avg/40'
                :                              'bg-great/10 text-great border border-great/40';
  return (
    <>
      <tr onClick={onToggle}
          className={`border-b hrule cursor-pointer ${isOpen ? 'bg-ink/[0.04] dark:bg-ink-dark/[0.07]' : 'hover:bg-ink/[0.02] dark:hover:bg-ink-dark/[0.04]'}`}>
        <td className="cell-pad text-center text-muted dark:text-muted-dark">{isOpen ? '▾' : '▸'}</td>
        <td className="cell-pad">
          <button onClick={(e) => { e.stopPropagation(); onPickEmployee(d.email); }} className="font-medium hover:underline text-left">
            {d.name}
          </button>
          <div className="text-[11px] text-muted dark:text-muted-dark num">{d.email} · {d.area}</div>
        </td>
        <td className="cell-pad text-right num">{d.batch}</td>
        <td className="cell-pad text-right num font-semibold text-bad">{d.totalMissed}</td>
        <td className="cell-pad text-right num">{d.totalUnscheduled > 0 ? <span className="text-bad">{d.totalUnscheduled}</span> : <span className="text-muted dark:text-muted-dark">0</span>}</td>
        <td className="cell-pad text-right num">{d.totalDefaulted > 0 ? <span className="text-bad font-semibold">{d.totalDefaulted}</span> : <span className="text-muted dark:text-muted-dark">0</span>}</td>
        <td className="cell-pad">
          <span className={`inline-block px-2 py-0.5 text-[10px] uppercase tracking-wider font-semibold ${riskCls}`}>{d.riskLabel}</span>
        </td>
        <td className="cell-pad text-[12px] text-muted dark:text-muted-dark">{d.zm.startsWith('Unassigned') ? <span className="italic">{d.zm}</span> : d.zm}</td>
      </tr>
      {isOpen && (
        <tr>
          <td colSpan={8} className="p-4 bg-line/30 dark:bg-line-dark/20">
            <MissedSessionsPanel d={d} />
          </td>
        </tr>
      )}
    </>
  );
}

function MissedSessionsPanel({ d }: { d: IntelWithZm }) {
  if (d.missed.length === 0) return <Empty message="No missed sessions." />;
  return (
    <div className="border hrule bg-bg dark:bg-bg-dark">
      <table className="w-full text-[13px]">
        <thead>
          <tr>
            <TH className="w-[14%]">Session</TH>
            <TH>Topic</TH>
            <TH className="w-[14%]">Originally on</TH>
            <TH className="w-[42%]">Make-up Action</TH>
          </tr>
        </thead>
        <tbody>
          {d.missed.map(m => <MissedRow key={m.sessionNumber} d={d} m={m} />)}
        </tbody>
      </table>
    </div>
  );
}

function MissedRow({ d, m }: { d: DefaulterIntel; m: MissedSessionItem }) {
  const today = new Date().toISOString().slice(0, 10);
  const action = m.action;
  const overdue = action && action.status === 'pending' && action.assignedDate < today;

  return (
    <tr className="border-b hrule last:border-b-0 align-top">
      <td className="cell-pad font-medium">{m.sessionCode}</td>
      <td className="cell-pad text-[12px] leading-tight">{m.topic}</td>
      <td className="cell-pad text-[12px] num text-muted dark:text-muted-dark">{m.homeBatchDate ?? '—'}</td>
      <td className="cell-pad">
        {action == null ? <ScheduleControl d={d} m={m} /> : <AssignedControl d={d} m={m} action={action} overdue={!!overdue} />}
      </td>
    </tr>
  );
}

function ScheduleControl({ d, m }: { d: DefaulterIntel; m: MissedSessionItem }) {
  const [picking, setPicking] = useState(false);
  if (m.reassignmentOptions.length === 0) {
    return <span className="text-[12px] text-muted dark:text-muted-dark italic">No upcoming batches have this session — escalate to ZM.</span>;
  }
  if (!picking) {
    return (
      <button className="text-[11px] px-2 py-1 border border-accent text-accent hover:bg-accent hover:text-bg dark:hover:text-bg-dark transition-colors"
              onClick={() => setPicking(true)}>
        + Assign to make-up batch
      </button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] text-muted dark:text-muted-dark">Pick a future batch:</span>
      {m.reassignmentOptions.map(opt => (
        <button
          key={opt.batch + opt.date}
          className="text-[11px] num px-2 py-1 border border-line dark:border-line-dark hover:bg-accent hover:text-bg hover:border-accent"
          onClick={() => {
            upsertAction({
              kind: 'retraining', id: retrainingId(d.email, m.sessionNumber),
              email: d.email, sessionNumber: m.sessionNumber,
              originalBatch: d.batch, assignedBatch: opt.batch, assignedDate: opt.date,
              status: 'pending', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
            });
            setPicking(false);
          }}
        >
          B{opt.batch} · {opt.date}{opt.trainer ? ` · ${opt.trainer}` : ''}
        </button>
      ))}
      <button className="text-[11px] text-muted hover:text-ink dark:hover:text-ink-dark" onClick={() => setPicking(false)}>cancel</button>
    </div>
  );
}

function AssignedControl({ d, m, action, overdue }: {
  d: DefaulterIntel; m: MissedSessionItem; action: RetrainingAction; overdue: boolean;
}) {
  const stateCls = action.status === 'attended' ? 'bg-great/10 text-great border-great/30'
                 : action.status === 'no_show'  ? 'bg-bad/10 text-bad border-bad/30'
                 : overdue                      ? 'bg-bad/10 text-bad border-bad/30'
                 :                                'bg-avg/10 text-avg border-avg/30';
  const stateLabel = action.status === 'attended' ? 'ATTENDED'
                   : action.status === 'no_show'  ? 'NO-SHOW'
                   : overdue ? 'OVERDUE' : 'PENDING';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`inline-block px-2 py-0.5 border text-[10px] uppercase tracking-wider font-medium ${stateCls}`}>{stateLabel}</span>
      <span className="text-[12px] num">→ Batch {action.assignedBatch} on {action.assignedDate}</span>
      {action.status === 'pending' && overdue && (
        <>
          <button className="text-[11px] px-2 py-1 border border-great text-great hover:bg-great hover:text-bg"
                  onClick={() => upsertAction({ ...action, status: 'attended', updatedAt: new Date().toISOString() })}>
            Mark attended
          </button>
          <button className="text-[11px] px-2 py-1 border border-bad text-bad hover:bg-bad hover:text-bg"
                  onClick={() => upsertAction({ ...action, status: 'no_show', updatedAt: new Date().toISOString() })}>
            Mark no-show
          </button>
        </>
      )}
      <button className="text-[11px] text-muted hover:text-ink dark:hover:text-ink-dark underline"
              onClick={() => removeAction('retraining', retrainingId(d.email, m.sessionNumber))}>
        clear
      </button>
    </div>
  );
}

// ─── Heatmap ───────────────────────────────────────────────────────────────
function AttendanceHeatmap({ ds, zmIdx, onPickEmployee }: {
  ds: Dataset; zmIdx: ReturnType<typeof buildZmIndex>;
  onPickEmployee: (email: string) => void;
}) {
  const [sortBy, setSortBy] = useState<'name' | 'batch' | 'pct'>('batch');

  const rows = useMemo(() => {
    const list = ds.employees.map(e => {
      const cells: Status[] = Array.from({ length: TOTAL_TRAINING_SESSIONS }, (_, i) => {
        const a = ds.attendance.find(x => x.email === e.email && x.sessionNumber === i + 1);
        return (a?.status ?? null) as Status;
      });
      const held    = cells.filter(c => c === 'present' || c === 'absent').length;
      const present = cells.filter(c => c === 'present').length;
      const pct = held === 0 ? null : Math.round((present / held) * 1000) / 10;
      const zm = zmFor(e, zmIdx);
      return { emp: e, cells, pct, missed: cells.filter(c => c === 'absent').length, zm };
    });
    return list.sort((a, b) => {
      if (sortBy === 'name')  return a.emp.name.localeCompare(b.emp.name);
      if (sortBy === 'pct')   return (a.pct ?? -1) - (b.pct ?? -1);
      return a.emp.batch - b.emp.batch || a.emp.name.localeCompare(b.emp.name);
    });
  }, [ds, sortBy, zmIdx]);

  if (rows.length === 0) return <Empty message="No employees in current filter." />;

  return (
    <Section
      title="Attendance Heatmap"
      hint={<InfoTip>
        Every employee × every session. Scroll inside the box; column header
        stays stuck so you don't lose context.
      </InfoTip>}
      right={
        <span className="inline-flex items-center gap-2 flex-wrap">
          <span>{rows.length} employees × {TOTAL_TRAINING_SESSIONS} sessions</span>
          <SortToggle value={sortBy} onChange={setSortBy} />
        </span>
      }
    >
      <div className="border hrule table-scroll" style={{ maxHeight: 520 }}>
        <table className="w-full text-[12px]">
          <thead>
            <tr>
              <TH sticky className="w-[20%] bg-bg dark:bg-bg-dark">Employee</TH>
              <TH className="w-[5%]">Batch</TH>
              <TH className="w-[10%]">Area</TH>
              <TH className="w-[12%]">ZM</TH>
              {Array.from({ length: TOTAL_TRAINING_SESSIONS }, (_, i) => (
                <TH key={i} align="center">{i + 1}</TH>
              ))}
              <TH align="right" className="w-[7%]">Att%</TH>
              <TH align="right" className="w-[6%]">Missed</TH>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.emp.email} className="border-b hrule last:border-b-0 hover:bg-ink/[0.02] dark:hover:bg-ink-dark/[0.04]">
                <td className="cell-pad sticky left-0 bg-bg dark:bg-bg-dark">
                  <button onClick={() => onPickEmployee(r.emp.email)} className="font-medium hover:underline text-left">{r.emp.name}</button>
                  {r.emp.role === 'Exit' && <span className="ml-2 text-[9px] uppercase border border-bad/40 text-bad px-1">exit</span>}
                </td>
                <td className="cell-pad num">{r.emp.batch}</td>
                <td className="cell-pad text-muted dark:text-muted-dark">{r.emp.area}</td>
                <td className="cell-pad text-[11px] text-muted dark:text-muted-dark">{r.zm.startsWith('Unassigned') ? <span className="italic">—</span> : r.zm}</td>
                {r.cells.map((c, i) => (
                  <td key={i} className="px-1 py-1.5 text-center">
                    <AttCell status={c} sessionNumber={i + 1} />
                  </td>
                ))}
                <td className="cell-pad text-right"><PctCell value={r.pct} /></td>
                <td className="cell-pad text-right num">
                  {r.missed > 0 ? <span className="text-bad">{r.missed}</span> : <span className="text-muted dark:text-muted-dark">0</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function AttCell({ status, sessionNumber }: { status: Status; sessionNumber: number }) {
  const map: Record<string, { cls: string; label: string }> = {
    present:     { cls: 'bg-great',  label: 'present' },
    absent:      { cls: 'bg-bad',    label: 'absent' },
    rescheduled: { cls: 'bg-accent', label: 'rescheduled' },
    excused:     { cls: 'bg-muted',  label: 'excused' },
  };
  const m = status ? map[status] : null;
  return (
    <span title={`Session ${sessionNumber} — ${m?.label ?? 'not held yet'}`}
          className={`inline-block h-3.5 w-3.5 ${m?.cls ?? 'border border-line dark:border-line-dark'}`} />
  );
}

function SortToggle({ value, onChange }: { value: 'name'|'batch'|'pct'; onChange: (v: 'name'|'batch'|'pct') => void }) {
  const opts = [
    { id: 'batch' as const, label: 'Batch' },
    { id: 'name'  as const, label: 'A–Z'   },
    { id: 'pct'   as const, label: 'Lowest %' },
  ];
  return (
    <span className="inline-flex border hrule">
      {opts.map(o => (
        <button key={o.id} onClick={() => onChange(o.id)}
          className={`px-2 py-1 text-[11px] uppercase tracking-wider font-medium
            ${value === o.id ? 'bg-ink text-bg dark:bg-ink-dark dark:text-bg-dark' : 'hover:bg-ink/[0.04] dark:hover:bg-ink-dark/[0.04]'}`}>
          {o.label}
        </button>
      ))}
    </span>
  );
}
