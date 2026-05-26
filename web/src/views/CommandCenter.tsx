import { ReactNode, useMemo, useState } from 'react';
import {
  AttentionRow,
  Dataset,
  ProgramKpis,
  SessionStatus,
  computeAttention,
  computeKpis,
  computeSessionStatus,
  summarizeEmployees,
} from '../lib/derive';
import { Grouping, SessionGroup, drillSession } from '../lib/sessionDrill';
import { BATCHES, TOTAL_TRAINING_SESSIONS, ZONE_BY_BATCH, bandOf } from '../types';
import { InfoTip } from '../components/Tooltip';
import { Empty, PctCell, ScoreCell, Section, TH, useSort, usePager, Pager } from '../components/Atoms';
import { buildZmIndex, zmFor } from '../lib/zm';

export function CommandCenter({ ds, onPickEmployee }: {
  ds: Dataset;
  onPickEmployee: (email: string) => void;
}) {
  const summaries = useMemo(() => summarizeEmployees(ds), [ds]);
  const kpis      = useMemo(() => computeKpis(ds, summaries), [ds, summaries]);
  const sessions  = useMemo(() => computeSessionStatus(ds), [ds]);
  const attention = useMemo(() => computeAttention(summaries), [summaries]);
  const zmIdx     = useMemo(() => buildZmIndex(ds), [ds]);

  return (
    <div className="flex flex-col gap-6">
      <SessionProgressBar kpis={kpis} sessions={sessions} />
      <KpiStrip k={kpis} />
      <SessionTable rows={sessions} ds={ds} onPickEmployee={onPickEmployee} zmIdx={zmIdx} />
      <AttentionTable rows={attention} ds={ds} zmIdx={zmIdx} onPickEmployee={onPickEmployee} />
    </div>
  );
}

// ─── 1. Session Progress (10 sessions) ─────────────────────────────────────
function SessionProgressBar({ kpis, sessions }: { kpis: ProgramKpis; sessions: SessionStatus[] }) {
  return (
    <Section
      title="Session Progress"
      hint={<InfoTip>
        <b>10 sessions</b> tracked (the Attendance tab spans S1–S10). A session
        is <b>fully complete</b> when all 5 batches have finished it. A pulsing
        green dot marks a session that is <b>in progress</b> across some batches
        but not all yet.
      </InfoTip>}
      right={
        <span>
          <b className="num text-base text-ink dark:text-ink-dark">{kpis.sessionsCompleted}</b>
          <span> / {kpis.sessionsTotal} fully complete</span>
          {kpis.sessionsInProgress > 0 && <span> · {kpis.sessionsInProgress} in progress</span>}
        </span>
      }
    >
      <div className="grid grid-cols-10 gap-1">
        {sessions.map(s => {
          const isComplete = s.isFullyComplete;
          const isInProgress = !isComplete && s.batchesCompleted > 0;
          return (
            <div
              key={s.sessionNumber}
              title={`${s.sessionCode} — ${s.batchesCompleted}/5 batches complete`}
              className={`relative h-5 ${
                isComplete   ? 'bg-ink dark:bg-ink-dark'
                : isInProgress ? 'bg-ink/30 dark:bg-ink-dark/30'
                : 'bg-line dark:bg-line-dark'
              }`}
            >
              {isInProgress && (
                <span
                  className="absolute inset-0 flex items-center justify-center"
                  aria-label="in progress"
                >
                  <span className="block h-2.5 w-2.5 rounded-full bg-great animate-blink shadow-[0_0_0_2px_rgba(22,163,74,0.25)]" />
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-10 gap-1 mt-1.5">
        {sessions.map(s => (
          <div key={s.sessionNumber} className="text-[10px] text-center text-muted dark:text-muted-dark num">
            S{s.sessionNumber}
          </div>
        ))}
      </div>
    </Section>
  );
}

// ─── 2. KPI strip ──────────────────────────────────────────────────────────
function KpiStrip({ k }: { k: ProgramKpis }) {
  const tone = (v: number | null, bad: number, avg: number) =>
    v == null ? undefined : v < bad ? 'bad' : v < avg ? 'avg' : 'great';

  const cells: {
    label: string; value: string; sub?: string;
    tone?: 'bad' | 'avg' | 'great'; tip: ReactNode;
  }[] = [
    {
      label: 'Overall Attendance',
      value: `${k.overallAttendancePct.toFixed(1)}%`,
      tone: tone(k.overallAttendancePct, 70, 85),
      tip: <>YES marks ÷ (YES + NO) across every employee × held session 1–10.</>,
    },
    {
      label: 'Avg Assessment',
      value: k.avgAssessmentScore != null ? `${k.avgAssessmentScore.toFixed(1)} / 10` : '—',
      sub: k.avgAssessmentScore != null
        ? (k.avgAssessmentScore < 3 ? 'weak' : k.avgAssessmentScore < 5 ? 'needs work' : 'on track')
        : 'not assessed',
      tone: tone(k.avgAssessmentScore, 3, 6),
      tip: <>Average of every score recorded. Blank cells excluded. A literal <b>0</b> counts.</>,
    },
    {
      label: 'Employees At Risk',
      value: `${k.employeesAtRisk}`,
      sub: `of ${k.activeEmployees} active`,
      tone: k.employeesAtRisk > 0 ? 'bad' : 'great',
      tip: <>Weak (0–2) on any competency OR missed ≥ 2 sessions. Excludes Exit role.</>,
    },
    {
      label: 'Trainer Utilization',
      value: `${k.trainerUtilizationPct.toFixed(1)}%`,
      tone: tone(k.trainerUtilizationPct, 30, 70),
      tip: <>Delivered / assigned trainer-slots across sessions 1–10.</>,
    },
  ];

  return (
    <section className="grid grid-cols-1 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x hrule border-y hrule">
      {cells.map(c => (
        <div key={c.label} className="px-4 py-4 flex flex-col gap-1">
          <div className="label-xs flex items-center">
            {c.label}<InfoTip>{c.tip}</InfoTip>
          </div>
          <div className="flex items-baseline gap-2">
            <div className="num text-3xl font-semibold">{c.value}</div>
            {c.tone && (
              <span className={`inline-block w-1.5 h-1.5 rounded-full
                ${c.tone === 'bad' ? 'bg-bad' : c.tone === 'avg' ? 'bg-avg' : 'bg-great'}`} />
            )}
          </div>
          {c.sub && <div className="text-[11px] text-muted dark:text-muted-dark">{c.sub}</div>}
        </div>
      ))}
    </section>
  );
}

// ─── 3. Session table with 3-level drill-down ──────────────────────────────
function SessionTable({ rows, ds, onPickEmployee, zmIdx }: {
  rows: SessionStatus[];
  ds: Dataset;
  onPickEmployee: (email: string) => void;
  zmIdx: ReturnType<typeof buildZmIndex>;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [grouping, setGrouping] = useState<Grouping>('batch');

  const toggle = (n: number) => {
    const next = new Set(expanded);
    next.has(n) ? next.delete(n) : next.add(n);
    setExpanded(next);
  };

  return (
    <Section
      title="Sessions"
      hint={<InfoTip>
        One row per session. Click to drill into per-batch / per-ZM / per-zone
        attendance + trainer + average score, then into individual employees.
      </InfoTip>}
      right={
        <span className="inline-flex items-center gap-3">
          <span>{TOTAL_TRAINING_SESSIONS} sessions · 5 batches each</span>
          <GroupToggle value={grouping} onChange={setGrouping} />
        </span>
      }
    >
      <div className="border hrule overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <TH align="center" className="w-[3%]"> </TH>
              <TH className="w-[5%]">#</TH>
              <TH className="w-[11%]">Session</TH>
              <TH>Topic</TH>
              <TH className="w-[14%]">
                <span className="inline-flex items-center">Batches
                  <InfoTip>● completed · ◐ scheduled · ○ no row in Calendar.</InfoTip>
                </span>
              </TH>
              <TH align="right" className="w-[8%]">Att%</TH>
              <TH align="right" className="w-[9%]">Avg Score</TH>
              <TH className="w-[20%]">Trainers</TH>
            </tr>
          </thead>
          <tbody>
            {rows.map(s => (
              <SessionRow
                key={s.sessionNumber}
                row={s}
                isOpen={expanded.has(s.sessionNumber)}
                onToggle={() => toggle(s.sessionNumber)}
                ds={ds}
                grouping={grouping}
                onPickEmployee={onPickEmployee}
                zmIdx={zmIdx}
              />
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function GroupToggle({ value, onChange }: { value: Grouping; onChange: (g: Grouping) => void }) {
  const opts: { id: Grouping; label: string; tip: string }[] = [
    { id: 'batch', label: 'Batch', tip: 'Group by training batch (1–5)' },
    { id: 'zm',    label: 'ZM',    tip: 'Group by Zonal Manager (inherits across the zone)' },
    { id: 'zone',  label: 'Zone',  tip: 'Group by geographic zone' },
  ];
  return (
    <span className="inline-flex border hrule">
      {opts.map(o => (
        <button
          key={o.id}
          title={o.tip}
          onClick={() => onChange(o.id)}
          className={`px-2 py-1 text-[11px] uppercase tracking-wider font-medium
            ${value === o.id
              ? 'bg-ink text-bg dark:bg-ink-dark dark:text-bg-dark'
              : 'hover:bg-ink/[0.04] dark:hover:bg-ink-dark/[0.04]'}`}
        >
          {o.label}
        </button>
      ))}
    </span>
  );
}

function SessionRow({ row, isOpen, onToggle, ds, grouping, onPickEmployee, zmIdx }: {
  row: SessionStatus; isOpen: boolean; onToggle: () => void; ds: Dataset; grouping: Grouping;
  onPickEmployee: (email: string) => void; zmIdx: ReturnType<typeof buildZmIndex>;
}) {
  const groups = useMemo(
    () => isOpen ? drillSession(ds, row.sessionNumber, grouping) : [],
    [isOpen, ds, row.sessionNumber, grouping],
  );

  return (
    <>
      <tr
        onClick={onToggle}
        className={`border-b hrule cursor-pointer transition-colors
          ${isOpen ? 'bg-ink/[0.03] dark:bg-ink-dark/[0.05]' : 'hover:bg-ink/[0.02] dark:hover:bg-ink-dark/[0.04]'}`}
      >
        <td className="cell-pad text-muted dark:text-muted-dark num text-center">{isOpen ? '▾' : '▸'}</td>
        <td className="cell-pad num text-muted dark:text-muted-dark">{row.sessionNumber}</td>
        <td className="cell-pad font-medium">{row.sessionCode}</td>
        <td className="cell-pad text-[13px] leading-tight">{row.topic}</td>
        <td className="cell-pad"><BatchDots row={row} /></td>
        <td className="cell-pad text-right"><PctCell value={row.attendancePct} /></td>
        <td className="cell-pad text-right">
          {row.avgScore == null ? <span className="text-muted dark:text-muted-dark">—</span>
            : <ScoreCell score={row.avgScore} band={bandOf(row.avgScore)} />}
        </td>
        <td className="cell-pad text-[12px] num text-muted dark:text-muted-dark">
          {row.trainers.join(', ') || '—'}
        </td>
      </tr>
      {isOpen && (
        <tr>
          <td colSpan={8} className="bg-line/40 dark:bg-line-dark/30 px-5 py-3 border-b hrule">
            <SessionGroups groups={groups} grouping={grouping} onPickEmployee={onPickEmployee} zmIdx={zmIdx} />
          </td>
        </tr>
      )}
    </>
  );
}

function BatchDots({ row }: { row: SessionStatus }) {
  return (
    <div className="flex items-center gap-1.5">
      {row.batches.map(b => {
        const cls = b.state === 'completed' ? 'bg-ink dark:bg-ink-dark border-ink dark:border-ink-dark'
                  : b.state === 'scheduled' ? 'bg-ink/30 dark:bg-ink-dark/30 border-ink/40 dark:border-ink-dark/40'
                  : 'border-line dark:border-line-dark';
        const label = `Batch ${b.batch} — ${ZONE_BY_BATCH[b.batch].zone}\n`
                    + `${b.state === 'completed' ? 'DONE' : b.state === 'scheduled' ? 'SCHEDULED' : 'NOT IN CALENDAR'}\n`
                    + (b.date    ? `Date: ${b.date}\n` : '')
                    + (b.trainer ? `Trainer: ${b.trainer}\n` : '')
                    + (b.attendancePct != null ? `Attendance: ${b.attendancePct.toFixed(1)}%` : '');
        return (
          <span
            key={b.batch}
            title={label}
            className={`inline-block h-2.5 w-2.5 rounded-full border ${cls} cursor-help`}
          />
        );
      })}
      <span className="ml-2 text-[10px] text-muted dark:text-muted-dark num">
        {row.batchesCompleted}/{BATCHES.length}
      </span>
    </div>
  );
}

// ─── Level 2: drilled groups (batches/ZMs/zones) ────────────────────────────
function SessionGroups({ groups, grouping, onPickEmployee, zmIdx }: {
  groups: SessionGroup[]; grouping: Grouping; onPickEmployee: (email: string) => void;
  zmIdx: ReturnType<typeof buildZmIndex>;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (k: string) => {
    const next = new Set(open);
    next.has(k) ? next.delete(k) : next.add(k);
    setOpen(next);
  };

  if (groups.length === 0) return <Empty message="No groups for this view." />;

  return (
    <div className="border hrule bg-bg dark:bg-bg-dark">
      <table className="w-full text-[13px]">
        <thead>
          <tr>
            <TH align="center" className="w-[3%]"> </TH>
            <TH className="w-[18%]">{grouping === 'batch' ? 'Batch' : grouping === 'zm' ? 'ZM' : 'Zone'}</TH>
            <TH className="w-[13%]">Trainer · Date</TH>
            <TH align="right" className="w-[8%]">Total</TH>
            <TH align="right" className="w-[8%]">Present</TH>
            <TH align="right" className="w-[8%]">Absent</TH>
            <TH align="right" className="w-[8%]">Att%</TH>
            <TH align="right" className="w-[10%]">Avg Score</TH>
            <TH>ZM</TH>
          </tr>
        </thead>
        <tbody>
          {groups.map(g => (
            <GroupRow
              key={g.key}
              group={g}
              isOpen={open.has(g.key)}
              onToggle={() => toggle(g.key)}
              onPickEmployee={onPickEmployee}
              zmIdx={zmIdx}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GroupRow({ group, isOpen, onToggle, onPickEmployee, zmIdx }: {
  group: SessionGroup; isOpen: boolean; onToggle: () => void; onPickEmployee: (email: string) => void;
  zmIdx: ReturnType<typeof buildZmIndex>;
}) {
  const stateDot = group.state === 'completed' ? 'bg-great' : group.state === 'scheduled' ? 'bg-avg' : 'bg-line dark:bg-line-dark';
  const zmDisplay = zmIdx.byBatch.get(group.batch) ?? group.zmName ?? null;
  return (
    <>
      <tr
        onClick={onToggle}
        className={`border-b hrule cursor-pointer
          ${isOpen ? 'bg-ink/[0.04] dark:bg-ink-dark/[0.07]' : 'hover:bg-ink/[0.02] dark:hover:bg-ink-dark/[0.04]'}`}
      >
        <td className="cell-pad text-muted dark:text-muted-dark text-center">{isOpen ? '▾' : '▸'}</td>
        <td className="cell-pad">
          <div className="font-medium flex items-center gap-2">
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${stateDot}`} />
            {group.label}
          </div>
          <div className="text-[11px] text-muted dark:text-muted-dark">{group.sublabel}</div>
        </td>
        <td className="cell-pad text-[12px] num">
          <div>{group.trainer ?? <span className="text-muted dark:text-muted-dark">— no trainer</span>}</div>
          <div className="text-muted dark:text-muted-dark">{group.date ?? 'TBD'}</div>
        </td>
        <td className="cell-pad text-right num font-semibold">{group.totalEmployees}</td>
        <td className="cell-pad text-right num text-great">{group.present || '—'}</td>
        <td className="cell-pad text-right num text-bad">{group.absent || '—'}</td>
        <td className="cell-pad text-right"><PctCell value={group.attendancePct} /></td>
        <td className="cell-pad text-right"><ScoreCell score={group.avgScore} band={group.band} /></td>
        <td className="cell-pad text-[12px] num text-muted dark:text-muted-dark">
          {zmDisplay ?? <span className="italic">unassigned</span>}
        </td>
      </tr>
      {isOpen && (
        <tr>
          <td colSpan={9} className="px-4 py-2 bg-line/30 dark:bg-line-dark/20">
            <EmployeeList group={group} onPickEmployee={onPickEmployee} />
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Level 3: individuals ──────────────────────────────────────────────────
function EmployeeList({ group, onPickEmployee }: {
  group: SessionGroup; onPickEmployee: (email: string) => void;
}) {
  if (group.employees.length === 0) return <Empty message="No employees in this group." />;
  return (
    <div className="border hrule bg-bg dark:bg-bg-dark">
      <table className="w-full text-[12px]">
        <thead>
          <tr>
            <TH className="w-[28%]">Employee</TH>
            <TH className="w-[8%]">Role</TH>
            <TH className="w-[14%]">Area</TH>
            <TH className="w-[10%]">
              <span className="inline-flex items-center">This Session
                <InfoTip>PRESENT · ABSENT · UPCOMING for this specific session.</InfoTip>
              </span>
            </TH>
            <TH align="right" className="w-[12%]">Avg Score</TH>
            <TH align="right">
              <span className="inline-flex items-center">Whole-program Att%
                <InfoTip align="right">Their total attendance across all held sessions.</InfoTip>
              </span>
            </TH>
            <TH align="right">
              <span className="inline-flex items-center">Total Missed
                <InfoTip align="right">Absences across the whole program. High = intervention candidate.</InfoTip>
              </span>
            </TH>
          </tr>
        </thead>
        <tbody>
          {group.employees.map(e => {
            const attTone = e.attendanceStatus === 'present' ? 'text-great'
                          : e.attendanceStatus === 'absent' ? 'text-bad'
                          : e.attendanceStatus === 'rescheduled' ? 'text-accent'
                          : 'text-muted dark:text-muted-dark';
            const attLabel = e.attendanceStatus ? e.attendanceStatus.toUpperCase() : 'UPCOMING';
            return (
              <tr key={e.email} className="border-b hrule last:border-b-0 hover:bg-ink/[0.03] dark:hover:bg-ink-dark/[0.05]">
                <td className="cell-pad">
                  <button onClick={() => onPickEmployee(e.email)} className="font-medium hover:underline text-left">
                    {e.name}
                  </button>
                  <div className="text-[10px] text-muted dark:text-muted-dark num">{e.email}</div>
                </td>
                <td className="cell-pad num">
                  <span className={`px-1.5 py-0.5 border hrule text-[10px] uppercase ${
                    e.role === 'ZM'   ? 'border-accent text-accent'
                    : e.role === 'BDM'? 'border-ink/40 dark:border-ink-dark/40'
                    : e.role === 'BDA'? 'border-line dark:border-line-dark text-muted dark:text-muted-dark'
                    : 'border-bad/40 text-bad'
                  }`}>{e.role}</span>
                </td>
                <td className="cell-pad">{e.area}</td>
                <td className={`cell-pad num font-medium ${attTone}`}>{attLabel}</td>
                <td className="cell-pad text-right"><ScoreCell score={e.avgScore} band={e.band} /></td>
                <td className="cell-pad text-right"><PctCell value={e.totalAttendancePct} /></td>
                <td className="cell-pad text-right num">
                  {e.totalSessionsMissed > 0
                    ? <span className="text-bad">{e.totalSessionsMissed}</span>
                    : <span className="text-muted dark:text-muted-dark">0</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── 4. Attention Required — sortable + paginated ──────────────────────────
function AttentionTable({ rows, ds, zmIdx, onPickEmployee }: {
  rows: AttentionRow[]; ds: Dataset; zmIdx: ReturnType<typeof buildZmIndex>;
  onPickEmployee: (email: string) => void;
}) {
  // Enrich rows with the resolved ZM for sorting/filtering
  const enriched = useMemo(() => rows.map(r => {
    const emp = ds.employees.find(e => e.email === r.email);
    return { ...r, zm: emp ? zmFor(emp, zmIdx) : 'Unassigned' };
  }), [rows, ds, zmIdx]);

  const { sorted, sortKey, sortDir, toggle } = useSort(enriched, { key: 'severity', dir: 'desc' });
  const pager = usePager(sorted, 15);

  return (
    <Section
      title="Attention Required"
      hint={<InfoTip>
        Every active employee ranked by intervention urgency: ≥3 absences, low
        attendance, any Weak (0–2) score, etc. Each column is sortable; the
        list pages through everyone with an open issue.
      </InfoTip>}
      right={<span>{rows.length} total · sortable + paginated</span>}
    >
      <div className="border hrule">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <TH sortKey="name" current={sortKey} dir={sortDir} onToggle={toggle} className="w-[28%]">Employee</TH>
              <TH sortKey="batch" current={sortKey} dir={sortDir} onToggle={toggle} align="right" className="w-[7%]">Batch</TH>
              <TH sortKey="severity" current={sortKey} dir={sortDir} onToggle={toggle} align="right" className="w-[10%]">Severity</TH>
              <TH sortKey="issue" current={sortKey} dir={sortDir} onToggle={toggle}>Issue</TH>
              <TH sortKey="zm" current={sortKey} dir={sortDir} onToggle={toggle} className="w-[20%]">ZM</TH>
            </tr>
          </thead>
          <tbody>
            {pager.slice.length === 0 && (
              <tr><td colSpan={5} className="cell-pad text-center text-muted dark:text-muted-dark py-6">
                Nothing on fire. Program is healthy.
              </td></tr>
            )}
            {pager.slice.map(r => (
              <tr key={r.email} className="border-b hrule last:border-b-0 hover:bg-ink/[0.02] dark:hover:bg-ink-dark/[0.04]">
                <td className="cell-pad">
                  <button onClick={() => onPickEmployee(r.email)} className="font-medium hover:underline text-left">{r.name}</button>
                  <div className="text-[11px] text-muted dark:text-muted-dark num">{r.email}</div>
                </td>
                <td className="cell-pad text-right num">{r.batch}</td>
                <td className="cell-pad text-right num text-bad font-semibold">{r.severity}</td>
                <td className="cell-pad text-[13px]">{r.issue}</td>
                <td className="cell-pad text-[13px] text-muted dark:text-muted-dark">
                  {r.zm.startsWith('Unassigned') ? <span className="italic">{r.zm}</span> : r.zm}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pager {...pager} />
      </div>
    </Section>
  );
}
