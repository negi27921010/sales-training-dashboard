import { Fragment, useMemo, useState } from 'react';
import {
  Line, LineChart, CartesianGrid, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer,
  PolarAngleAxis, PolarGrid, Radar, RadarChart,
} from 'recharts';
import { Dataset, competencyAggregate } from '../lib/derive';
import { BAND_COLOR, BAND_LABEL, COMPETENCIES, bandOf } from '../types';
import { InfoTip } from '../components/Tooltip';
import { BandPill, Empty, Section, TH, useSort } from '../components/Atoms';
import {
  buildReAssessmentIntel, buildScoreTrend, findUngradedSessions,
  ReAssessmentIntel, UngradedSlot,
} from '../lib/intelligence';
import { reassessmentId, upsertAction, useActions } from '../lib/actions';
import { buildZmIndex, zmFor } from '../lib/zm';

// ─── Filters ──────────────────────────────────────────────────────────────
interface AsmFilters {
  zm: string;          // 'all' or ZM name
  employee: string;    // 'all' or email
  trainer: string;     // 'all' or trainer name
}

export function AssessmentCompetency({ ds, onPickEmployee }: {
  ds: Dataset;
  onPickEmployee: (email: string) => void;
}) {
  const [filters, setFilters] = useState<AsmFilters>({ zm: 'all', employee: 'all', trainer: 'all' });
  const actions = useActions();
  const zmIdx = useMemo(() => buildZmIndex(ds), [ds]);

  // Filtered dataset: subset of employees + assessments matching filters.
  const filteredDs = useMemo(() => {
    const trainerEmails = new Set<string>();
    if (filters.trainer !== 'all') {
      const trainerSessions = new Set(
        ds.batchSessions
          .filter(b => b.trainerName === filters.trainer && b.status === 'completed')
          .map(b => `${b.sessionNumber}-${b.batch}`),
      );
      for (const a of ds.attendance) {
        if (a.status !== 'present') continue;
        if (trainerSessions.has(`${a.sessionNumber}-${a.batch}`)) trainerEmails.add(a.email);
      }
    }

    const emps = ds.employees.filter(e => {
      if (filters.zm !== 'all' && zmFor(e, zmIdx) !== filters.zm) return false;
      if (filters.employee !== 'all' && e.email !== filters.employee) return false;
      if (filters.trainer !== 'all' && !trainerEmails.has(e.email)) return false;
      return true;
    });
    const emails = new Set(emps.map(e => e.email));
    return {
      ...ds,
      employees: emps,
      assessments: ds.assessments.filter(a => emails.has(a.email)),
      attendance:  ds.attendance.filter(a  => emails.has(a.email)),
    };
  }, [ds, filters, zmIdx]);

  const ungraded = useMemo(() => findUngradedSessions(filteredDs), [filteredDs]);
  const intel    = useMemo(() => buildReAssessmentIntel(filteredDs, actions), [filteredDs, actions]);

  const focusedEmail = filters.employee !== 'all' ? filters.employee : null;

  return (
    <div className="flex flex-col gap-6">
      <FilterBar ds={ds} zmIdx={zmIdx} filters={filters} setFilters={setFilters} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CompetencyRadar ds={filteredDs} focusedEmail={focusedEmail} />
        <CompetencyBreakdown ds={filteredDs} focusedEmail={focusedEmail} />
      </div>
      {focusedEmail && <ScoreTrend ds={ds} email={focusedEmail} />}
      <UngradedSessions slots={ungraded} />
      <ReAssessmentQueue intel={intel} zmIdx={zmIdx} onPickEmployee={onPickEmployee} />
      <EmployeeGrid ds={filteredDs} zmIdx={zmIdx} onPickEmployee={onPickEmployee} setFilters={setFilters} />
    </div>
  );
}

// ─── Filter Bar ────────────────────────────────────────────────────────────
function FilterBar({ ds, zmIdx, filters, setFilters }: {
  ds: Dataset; zmIdx: ReturnType<typeof buildZmIndex>;
  filters: AsmFilters; setFilters: (f: AsmFilters) => void;
}) {
  const trainers = useMemo(
    () => Array.from(new Set(ds.batchSessions.map(b => b.trainerName).filter(Boolean) as string[])).sort(),
    [ds],
  );
  const [empQ, setEmpQ] = useState('');
  const empMatches = useMemo(() => {
    const t = empQ.trim().toLowerCase();
    if (!t) return [];
    return ds.employees
      .filter(e => e.name.toLowerCase().includes(t) || e.email.toLowerCase().includes(t))
      .slice(0, 8);
  }, [ds, empQ]);

  const selectedEmp = filters.employee !== 'all'
    ? ds.employees.find(e => e.email === filters.employee) ?? null
    : null;

  return (
    <Section
      title="Filters"
      hint={<InfoTip>
        Three independent filters. Combine to scope every section below.
        Selecting an Employee also unlocks the Score Trend chart.
      </InfoTip>}
    >
      <div className="border hrule p-3 grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* ZM */}
        <div>
          <div className="label-xs mb-1">ZM</div>
          <select
            className="w-full bg-transparent border hrule px-2 py-2 text-sm outline-none font-mono focus:ring-1 focus:ring-accent"
            value={filters.zm}
            onChange={e => setFilters({ ...filters, zm: e.target.value })}
          >
            <option value="all">All ZMs</option>
            {zmIdx.list.map(z => <option key={z} value={z}>{z}</option>)}
          </select>
        </div>
        {/* Employee */}
        <div>
          <div className="label-xs mb-1">Employee</div>
          {selectedEmp ? (
            <div className="border hrule px-3 py-2 flex items-center justify-between">
              <div>
                <div className="font-medium text-sm">{selectedEmp.name}</div>
                <div className="text-[11px] text-muted dark:text-muted-dark num">{selectedEmp.email}</div>
              </div>
              <button className="btn-ghost" onClick={() => setFilters({ ...filters, employee: 'all' })}>CLEAR</button>
            </div>
          ) : (
            <>
              <input
                type="text" value={empQ}
                onChange={e => setEmpQ(e.target.value)}
                placeholder="Search name or email…"
                className="w-full bg-transparent border hrule px-2 py-2 text-sm outline-none focus:ring-1 focus:ring-accent"
              />
              {empQ && empMatches.length > 0 && (
                <div className="mt-1 border hrule divide-y hrule max-h-40 overflow-auto">
                  {empMatches.map(m => (
                    <button
                      key={m.email}
                      onClick={() => { setFilters({ ...filters, employee: m.email }); setEmpQ(''); }}
                      className="w-full text-left px-3 py-2 text-[12px] hover:bg-ink/[0.04] dark:hover:bg-ink-dark/[0.05]"
                    >
                      <div className="font-medium">{m.name}</div>
                      <div className="text-[10px] text-muted dark:text-muted-dark num">{m.email} · B{m.batch}</div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        {/* Trainer */}
        <div>
          <div className="label-xs mb-1">Trainer</div>
          <select
            className="w-full bg-transparent border hrule px-2 py-2 text-sm outline-none font-mono focus:ring-1 focus:ring-accent"
            value={filters.trainer}
            onChange={e => setFilters({ ...filters, trainer: e.target.value })}
          >
            <option value="all">All trainers</option>
            {trainers.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>
    </Section>
  );
}

// ─── Radar (now at top) ────────────────────────────────────────────────────
function CompetencyRadar({ ds, focusedEmail }: { ds: Dataset; focusedEmail: string | null }) {
  const data = useMemo(() => {
    if (focusedEmail) {
      return COMPETENCIES.map(c => {
        const rows = ds.assessments.filter(a => a.email === focusedEmail && a.competency === c && a.score != null);
        const avg = rows.length === 0 ? null
          : Math.round((rows.reduce((s, r) => s + (r.score as number), 0) / rows.length) * 10) / 10;
        return { competency: c, score: avg ?? 0, assessed: rows.length };
      });
    }
    return competencyAggregate(ds).map(c => ({
      competency: c.competency, score: c.avg ?? 0, assessed: c.assessed,
    }));
  }, [ds, focusedEmail]);

  return (
    <Section
      title={focusedEmail ? 'Competency Radar — Selected Person' : 'Competency Radar — Org'}
      hint={<InfoTip>10 axes, one per competency. Larger shape = stronger across the board.</InfoTip>}
    >
      <div className="border hrule p-4 h-96 bg-bg dark:bg-bg-dark">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart outerRadius="82%" data={data}>
            <PolarGrid stroke="currentColor" strokeOpacity={0.15} />
            <PolarAngleAxis dataKey="competency" tick={{ fontSize: 11, fill: 'currentColor' }} />
            <Radar dataKey="score" stroke="#0D9488" fill="#0D9488" fillOpacity={0.28} />
            <RTooltip
              contentStyle={{ fontSize: 12, background: 'rgba(10,10,10,0.92)', color: '#fff', border: 'none' }}
              formatter={(v: any, _n, ctx: any) => [`${v} / 10 · ${ctx.payload.assessed} assessed`, ctx.payload.competency]}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </Section>
  );
}

// ─── Score Trend (single person) ───────────────────────────────────────────
function ScoreTrend({ ds, email }: { ds: Dataset; email: string }) {
  const trend = useMemo(() => buildScoreTrend(ds, email), [ds, email]);
  const data = trend.map(p => ({
    session: p.sessionCode.replace('Deep Dive ', 'DD').replace('Basics ', 'B'),
    score: p.avgScore ?? null,
  }));
  return (
    <Section title="Score Trend"
      hint={<InfoTip>Average score per session for the selected employee. Gaps = "not assessed yet."</InfoTip>}>
      <div className="border hrule p-3 h-64 bg-bg dark:bg-bg-dark">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} />
            <XAxis dataKey="session" tick={{ fontSize: 10 }} stroke="currentColor" strokeOpacity={0.4} />
            <YAxis domain={[0, 10]} tick={{ fontSize: 10 }} stroke="currentColor" strokeOpacity={0.4} />
            <RTooltip contentStyle={{ fontSize: 12, background: 'rgba(10,10,10,0.92)', color: '#fff', border: 'none' }} />
            <Line type="monotone" dataKey="score" stroke="#0D9488" strokeWidth={2} dot={{ r: 4 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Section>
  );
}

// ─── Breakdown ─────────────────────────────────────────────────────────────
function CompetencyBreakdown({ ds, focusedEmail }: { ds: Dataset; focusedEmail: string | null }) {
  const rows = useMemo(() => {
    return COMPETENCIES.map(c => {
      const all = ds.assessments.filter(a =>
        a.competency === c
        && a.score != null
        && (!focusedEmail || a.email === focusedEmail),
      );
      const total = all.length;
      const dist: Record<string, number> = { weak: 0, ok: 0, good: 0, great: 0, excellent: 0 };
      for (const a of all) { const b = bandOf(a.score); if (b) dist[b]++; }
      const avg = total === 0 ? null
        : Math.round((all.reduce((s, x) => s + (x.score as number), 0) / total) * 10) / 10;
      return { competency: c, avg, total, dist };
    }).sort((a, b) => (a.avg ?? 11) - (b.avg ?? 11));
  }, [ds, focusedEmail]);

  return (
    <Section title="Competency Breakdown"
      hint={<InfoTip>
        Sorted lowest-avg first. 5-segment bar: <span className="text-bad">Weak</span> ·
        <span className="text-avg"> OK</span> · Good · Great · Excellent.
      </InfoTip>}>
      <div className="border hrule">
        <table className="w-full text-[13px]">
          <thead>
            <tr>
              <TH>Competency</TH>
              <TH align="right" className="w-[10%]">Avg</TH>
              <TH className="w-[45%]">Distribution</TH>
              <TH align="right" className="w-[10%]">N</TH>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.competency} className="border-b hrule last:border-b-0">
                <td className="cell-pad font-medium">{r.competency}</td>
                <td className="cell-pad text-right num">
                  {r.avg == null ? <span className="text-muted dark:text-muted-dark">—</span>
                    : <span style={{ color: BAND_COLOR[bandOf(r.avg)!] }}>{r.avg.toFixed(1)}</span>}
                </td>
                <td className="cell-pad">
                  {r.total === 0 ? <span className="text-muted dark:text-muted-dark text-[11px]">no data</span>
                    : <DistroBar dist={r.dist} total={r.total} />}
                </td>
                <td className="cell-pad text-right num text-muted dark:text-muted-dark">{r.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function DistroBar({ dist, total }: { dist: Record<string, number>; total: number }) {
  const pct = (n: number) => total === 0 ? 0 : (n / total) * 100;
  return (
    <div className="flex h-3 w-full">
      <div className="bg-weak"      title={`Weak: ${dist.weak}`}           style={{ width: `${pct(dist.weak)}%` }} />
      <div className="bg-ok"        title={`OK: ${dist.ok}`}               style={{ width: `${pct(dist.ok)}%` }} />
      <div className="bg-good"      title={`Good: ${dist.good}`}           style={{ width: `${pct(dist.good)}%` }} />
      <div className="bg-great"     title={`Great: ${dist.great}`}         style={{ width: `${pct(dist.great)}%` }} />
      <div className="bg-excellent" title={`Excellent: ${dist.excellent}`} style={{ width: `${pct(dist.excellent)}%` }} />
    </div>
  );
}

// ─── Ungraded sessions ────────────────────────────────────────────────────
function UngradedSessions({ slots }: { slots: UngradedSlot[] }) {
  if (slots.length === 0) return null;
  return (
    <Section title="Action: trainers haven't scored these sessions yet"
      hint={<InfoTip>Sessions where less than half of attendees were assessed. The trainer should be nudged to grade.</InfoTip>}
      right={`${slots.length} session(s)`}>
      <div className="border border-bad/40 bg-bad/[0.04]">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <TH>Session · Batch</TH>
              <TH className="w-[15%]">Trainer</TH>
              <TH className="w-[12%]">Date</TH>
              <TH align="right" className="w-[18%]">Attended → Scored</TH>
              <TH className="w-[18%]">Gap</TH>
            </tr>
          </thead>
          <tbody>
            {slots.map((s, i) => {
              const gap = s.attendedCount - s.assessedCount;
              return (
                <tr key={i} className="border-b hrule last:border-b-0">
                  <td className="cell-pad font-medium">{s.sessionCode} · Batch {s.batch}</td>
                  <td className="cell-pad num">{s.trainer ?? <span className="italic text-muted dark:text-muted-dark">none</span>}</td>
                  <td className="cell-pad num text-muted dark:text-muted-dark">{s.date ?? '—'}</td>
                  <td className="cell-pad text-right num">
                    <span className="font-semibold">{s.attendedCount}</span>
                    <span className="text-muted dark:text-muted-dark"> attended</span>
                    {' → '}
                    <span className="font-semibold">{s.assessedCount}</span>
                    <span className="text-muted dark:text-muted-dark"> scored</span>
                  </td>
                  <td className="cell-pad">
                    <span className="inline-block px-2 py-0.5 text-[11px] uppercase tracking-wider font-medium bg-bad/10 text-bad border border-bad/40">
                      {gap} employees ungraded
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

// ─── Re-Assessment Queue ──────────────────────────────────────────────────
function ReAssessmentQueue({ intel, zmIdx, onPickEmployee }: {
  intel: ReAssessmentIntel[]; zmIdx: ReturnType<typeof buildZmIndex>;
  onPickEmployee: (email: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const actions = useActions();

  const enriched = useMemo(() => intel.map(p => {
    // re-resolve via the existing zmIdx + employee email
    void zmIdx;
    return { ...p, weakCount: p.weakCompetencies.length };
  }), [intel, zmIdx]);

  const { sorted, sortKey, sortDir, toggle: toggleSort } = useSort(enriched, { key: 'weakCount', dir: 'desc' });

  const toggle = (k: string) => {
    const next = new Set(expanded);
    next.has(k) ? next.delete(k) : next.add(k);
    setExpanded(next);
  };

  if (intel.length === 0) {
    return <Section title="Re-Assessment Queue"
      hint={<InfoTip>Active employees with Weak (0–2) scores. None right now.</InfoTip>}>
      <Empty message="No re-assessment cases." />
    </Section>;
  }

  return (
    <Section title="Re-Assessment Queue"
      hint={<InfoTip>One row per employee with any Weak score. Click to schedule per-competency re-assessments.</InfoTip>}
      right={<span className="num">{intel.length} employees</span>}>
      <div className="border hrule">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <TH align="center" className="w-[3%]"> </TH>
              <TH sortKey="name" current={sortKey} dir={sortDir} onToggle={toggleSort} className="w-[24%]">Employee</TH>
              <TH sortKey="batch" current={sortKey} dir={sortDir} onToggle={toggleSort} align="right" className="w-[7%]">Batch</TH>
              <TH className="w-[18%]">Worst Competency</TH>
              <TH align="right" className="w-[8%]">Score</TH>
              <TH sortKey="weakCount" current={sortKey} dir={sortDir} onToggle={toggleSort} align="right" className="w-[10%]">Weak Count</TH>
              <TH className="w-[14%]">Status</TH>
              <TH>ZM</TH>
            </tr>
          </thead>
          <tbody>
            {sorted.map(p => (
              <ReQueueRow key={p.email} p={p} actions={actions}
                isOpen={expanded.has(p.email)} onToggle={() => toggle(p.email)} onPickEmployee={onPickEmployee} />
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function ReQueueRow({ p, actions, isOpen, onToggle, onPickEmployee }: {
  p: ReAssessmentIntel; actions: any[]; isOpen: boolean; onToggle: () => void; onPickEmployee: (email: string) => void;
}) {
  const pending = p.weakCompetencies.length - p.scheduledCount - p.completedCount;
  const statusCls = pending > 0 ? 'bg-bad/10 text-bad border border-bad/40'
                  : p.completedCount === p.weakCompetencies.length ? 'bg-great/10 text-great border border-great/40'
                  : 'bg-avg/10 text-avg border border-avg/40';
  const statusLabel = pending > 0 ? `${pending} TO SCHEDULE`
                    : p.completedCount === p.weakCompetencies.length ? 'CLOSED'
                    : `${p.scheduledCount} SCHEDULED`;

  return (
    <>
      <tr onClick={onToggle}
          className={`border-b hrule cursor-pointer ${isOpen ? 'bg-ink/[0.04] dark:bg-ink-dark/[0.07]' : 'hover:bg-ink/[0.02] dark:hover:bg-ink-dark/[0.04]'}`}>
        <td className="cell-pad text-center text-muted dark:text-muted-dark">{isOpen ? '▾' : '▸'}</td>
        <td className="cell-pad">
          <button onClick={(e) => { e.stopPropagation(); onPickEmployee(p.email); }} className="font-medium hover:underline text-left">{p.name}</button>
          <div className="text-[11px] text-muted dark:text-muted-dark num">{p.email}</div>
        </td>
        <td className="cell-pad text-right num">{p.batch}</td>
        <td className="cell-pad text-[12px]">{p.worstCompetency.competency}</td>
        <td className="cell-pad text-right num font-semibold text-bad">{p.worstCompetency.score}</td>
        <td className="cell-pad text-right num">{p.weakCompetencies.length}</td>
        <td className="cell-pad">
          <span className={`inline-block px-2 py-0.5 text-[10px] uppercase tracking-wider font-semibold ${statusCls}`}>{statusLabel}</span>
        </td>
        <td className="cell-pad text-[12px] text-muted dark:text-muted-dark">{p.reportingManager ?? <span className="italic">unassigned</span>}</td>
      </tr>
      {isOpen && (
        <tr>
          <td colSpan={8} className="p-4 bg-line/30 dark:bg-line-dark/20">
            <WeakCompetencies p={p} actions={actions} />
          </td>
        </tr>
      )}
    </>
  );
}

function WeakCompetencies({ p, actions }: { p: ReAssessmentIntel; actions: any[] }) {
  return (
    <div className="border hrule bg-bg dark:bg-bg-dark">
      <table className="w-full text-[13px]">
        <thead>
          <tr>
            <TH className="w-[35%]">Competency</TH>
            <TH align="right" className="w-[10%]">Score</TH>
            <TH>Action</TH>
          </tr>
        </thead>
        <tbody>
          {p.weakCompetencies.map(w => {
            const action = actions.find(a => a.kind === 'reassessment' && a.id === reassessmentId(p.email, w.competency));
            return (
              <tr key={w.competency} className="border-b hrule last:border-b-0">
                <td className="cell-pad font-medium">{w.competency}</td>
                <td className="cell-pad text-right num text-bad font-semibold">{w.score}</td>
                <td className="cell-pad">
                  {action == null ? (
                    <button
                      className="text-[11px] px-2 py-1 border border-accent text-accent hover:bg-accent hover:text-bg dark:hover:text-bg-dark"
                      onClick={() => upsertAction({
                        kind: 'reassessment', id: reassessmentId(p.email, w.competency),
                        email: p.email, competency: w.competency,
                        originalScore: w.score, newScore: null, status: 'scheduled',
                        scheduledFor: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
                        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
                      })}>
                      + Schedule re-assessment
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className={`inline-block px-2 py-0.5 text-[10px] uppercase tracking-wider font-medium
                        ${action.status === 'completed' ? 'bg-great/10 text-great border border-great/40'
                          : 'bg-avg/10 text-avg border border-avg/40'}`}>
                        {action.status}
                      </span>
                      {action.scheduledFor && <span className="text-[11px] num">on {action.scheduledFor}</span>}
                      {action.status === 'scheduled' && (
                        <button className="text-[11px] px-2 py-1 border border-great text-great hover:bg-great hover:text-bg"
                          onClick={() => upsertAction({ ...action, status: 'completed', newScore: action.newScore ?? 6, updatedAt: new Date().toISOString() })}>
                          Mark completed
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Employee Assessment Grid — redesigned ─────────────────────────────────
function EmployeeGrid({ ds, zmIdx, onPickEmployee, setFilters }: {
  ds: Dataset;
  zmIdx: ReturnType<typeof buildZmIndex>;
  onPickEmployee: (email: string) => void;
  setFilters: (cb: (f: any) => any) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (k: string) => {
    const next = new Set(expanded);
    next.has(k) ? next.delete(k) : next.add(k);
    setExpanded(next);
  };

  const rows = useMemo(() => {
    return ds.employees.map(e => {
      const scoresByComp: Record<string, number | null> = {};
      let sumAll = 0, nAll = 0;
      const sessionsAssessed = new Set<number>();
      for (const c of COMPETENCIES) {
        const rs = ds.assessments.filter(a => a.email === e.email && a.competency === c && a.score != null);
        if (rs.length === 0) { scoresByComp[c] = null; continue; }
        scoresByComp[c] = Math.round((rs.reduce((s, r) => s + (r.score as number), 0) / rs.length) * 10) / 10;
        for (const r of rs) sessionsAssessed.add(r.sessionNumber);
        sumAll += rs.reduce((s, r) => s + (r.score as number), 0);
        nAll  += rs.length;
      }
      const avg = nAll === 0 ? null : Math.round((sumAll / nAll) * 10) / 10;
      return { emp: e, scoresByComp, avg, sessions: sessionsAssessed.size };
    });
  }, [ds]);

  const enriched = useMemo(() => rows.map(r => ({
    ...r, name: r.emp.name, batch: r.emp.batch, email: r.emp.email,
  })), [rows]);

  const { sorted, sortKey, sortDir, toggle: toggleSort } = useSort(enriched, { key: 'avg', dir: 'asc' });

  if (rows.length === 0) return <Empty message="No employees match current filter." />;

  return (
    <Section title="Employee Assessment Grid"
      hint={<InfoTip>
        Each row = one employee. Avg + sessions assessed live up front. Click
        a row to expand the per-session breakdown for that person.
      </InfoTip>}
      right={`${rows.length} employees`}>
      <div className="border hrule table-scroll" style={{ maxHeight: 600 }}>
        <table className="w-full text-[12px]">
          <thead>
            <tr>
              <TH align="center" className="w-[3%]"> </TH>
              <TH sortKey="name" current={sortKey} dir={sortDir} onToggle={toggleSort} sticky className="w-[18%] bg-bg dark:bg-bg-dark">Employee</TH>
              <TH sortKey="batch" current={sortKey} dir={sortDir} onToggle={toggleSort} align="right" className="w-[5%]">Batch</TH>
              <TH sortKey="avg" current={sortKey} dir={sortDir} onToggle={toggleSort} align="right" className="w-[7%]">Avg</TH>
              <TH sortKey="sessions" current={sortKey} dir={sortDir} onToggle={toggleSort} align="right" className="w-[6%]">Sessions</TH>
              <TH align="center" className="w-[6%]">Band</TH>
              {COMPETENCIES.map(c => {
                const lines = competencyLines(c);
                return (
                  <TH key={c} align="center">
                    <div className="leading-tight text-center">
                      <div>{lines[0]}</div>
                      {lines[1] && <div>{lines[1]}</div>}
                    </div>
                  </TH>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => {
              const band = bandOf(r.avg);
              return (
                <Fragment key={r.email}>
                  <tr onClick={() => toggle(r.email)}
                    className={`border-b hrule cursor-pointer ${expanded.has(r.email) ? 'bg-ink/[0.04] dark:bg-ink-dark/[0.07]' : 'hover:bg-ink/[0.02] dark:hover:bg-ink-dark/[0.04]'}`}>
                    <td className="cell-pad text-center text-muted dark:text-muted-dark">{expanded.has(r.email) ? '▾' : '▸'}</td>
                    <td className="cell-pad sticky left-0 bg-bg dark:bg-bg-dark">
                      <button onClick={(e) => { e.stopPropagation(); setFilters(f => ({ ...f, employee: r.email })); }}
                        className="font-medium hover:underline text-left">{r.emp.name}</button>
                      <button onClick={(e) => { e.stopPropagation(); onPickEmployee(r.email); }}
                        className="ml-2 text-[10px] text-muted dark:text-muted-dark hover:underline">profile→</button>
                    </td>
                    <td className="cell-pad text-right num">{r.batch}</td>
                    <td className="cell-pad text-right num">
                      {r.avg == null ? <span className="text-muted dark:text-muted-dark">—</span>
                        : <span className="font-semibold" style={{ color: BAND_COLOR[band!] }}>{r.avg.toFixed(1)}</span>}
                    </td>
                    <td className="cell-pad text-right num">{r.sessions > 0 ? r.sessions : <span className="text-muted dark:text-muted-dark">0</span>}</td>
                    <td className="cell-pad text-center">
                      {band ? <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ color: BAND_COLOR[band] }}>{BAND_LABEL[band]}</span>
                            : <span className="text-[10px] text-muted dark:text-muted-dark">—</span>}
                    </td>
                    {COMPETENCIES.map(c => (
                      <td key={c} className="px-1 py-1 text-center">
                        <BandPill score={r.scoresByComp[c]} band={bandOf(r.scoresByComp[c])} size="xs" label={`${c}: ${r.scoresByComp[c] ?? 'n/a'}`} />
                      </td>
                    ))}
                  </tr>
                  {expanded.has(r.email) && (
                    <tr>
                      <td colSpan={6 + COMPETENCIES.length} className="p-3 bg-line/30 dark:bg-line-dark/20">
                        <PerSessionBreakdown ds={ds} email={r.email} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
  void zmIdx;
}

function competencyLines(c: string): [string, string?] {
  const words = c.split(/\s+/);
  if (words.length === 1) return [c];
  return [words[0], words.slice(1).join(' ')];
}

function PerSessionBreakdown({ ds, email }: { ds: Dataset; email: string }) {
  const data = useMemo(() => buildScoreTrend(ds, email).filter(p => p.avgScore != null || COMPETENCIES.some(c => p.byCompetency[c] != null)), [ds, email]);
  if (data.length === 0) return <Empty message="No assessments captured for this employee yet." />;
  return (
    <div className="border hrule bg-bg dark:bg-bg-dark">
      <table className="w-full text-[12px]">
        <thead>
          <tr>
            <TH className="w-[10%]">Session</TH>
            <TH className="w-[20%]">Topic</TH>
            <TH align="right" className="w-[8%]">Avg</TH>
            <TH align="center" className="w-[10%]">Band</TH>
            {COMPETENCIES.map(c => {
              const lines = competencyLines(c);
              return (
                <TH key={c} align="center">
                  <div className="leading-tight">
                    <div>{lines[0]}</div>
                    {lines[1] && <div>{lines[1]}</div>}
                  </div>
                </TH>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {data.map(p => {
            const sess = ds.sessions.find(s => s.sessionNumber === p.sessionNumber);
            const band = bandOf(p.avgScore);
            return (
              <tr key={p.sessionNumber} className="border-b hrule last:border-b-0">
                <td className="cell-pad font-medium">{p.sessionCode}</td>
                <td className="cell-pad text-[11px] leading-tight">{sess?.topic ?? '—'}</td>
                <td className="cell-pad text-right num">
                  {p.avgScore == null ? <span className="text-muted dark:text-muted-dark">—</span>
                    : <span className="font-semibold" style={{ color: BAND_COLOR[band!] }}>{p.avgScore.toFixed(1)}</span>}
                </td>
                <td className="cell-pad text-center">
                  {band ? <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ color: BAND_COLOR[band] }}>{BAND_LABEL[band]}</span>
                        : <span className="text-[10px] text-muted dark:text-muted-dark">—</span>}
                </td>
                {COMPETENCIES.map(c => (
                  <td key={c} className="px-1 py-1 text-center">
                    <BandPill score={p.byCompetency[c]} band={bandOf(p.byCompetency[c])} size="xs" label={`${c}: ${p.byCompetency[c] ?? 'n/a'}`} />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

