import { useMemo, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer,
  PolarAngleAxis, PolarGrid, Radar, RadarChart, Tooltip as RTooltip, XAxis, YAxis, Legend,
} from 'recharts';
import { Dataset } from '../lib/derive';
import { buildProfile, EmployeeProfile } from '../lib/sessionDrill';
import { BAND_COLOR, ZONE_BY_BATCH } from '../types';
import { InfoTip } from '../components/Tooltip';
import { Empty, ScoreCell, Section } from '../components/Atoms';

export function People({ ds, selected, onPickEmployee }: {
  ds: Dataset;
  selected: string | null;
  onPickEmployee: (email: string | null) => void;
}) {
  const profile = useMemo(
    () => selected ? buildProfile(ds, selected) : null,
    [ds, selected],
  );

  return (
    <div className="flex flex-col gap-6">
      <EmployeePicker ds={ds} selected={selected} onPick={onPickEmployee} />
      {!profile && (
        <Empty message="Search or pick an employee above to see their full training profile." />
      )}
      {profile && <Profile p={profile} />}
    </div>
  );
}

function EmployeePicker({ ds, selected, onPick }: {
  ds: Dataset;
  selected: string | null;
  onPick: (email: string | null) => void;
}) {
  const [q, setQ] = useState('');
  const matches = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return ds.employees.slice(0, 12);
    return ds.employees
      .filter(e => e.name.toLowerCase().includes(term) || e.email.toLowerCase().includes(term) || e.area.toLowerCase().includes(term))
      .slice(0, 12);
  }, [ds, q]);

  return (
    <Section
      title="Find Employee"
      hint={<InfoTip>Search by name, email, or city. Click a match to load the full profile.</InfoTip>}
      right={`${ds.employees.length} in scope`}
    >
      <div className="border hrule p-3 flex gap-3 items-start">
        <div className="flex-1">
          <input
            type="text"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Type a name, email, or city…"
            className="w-full bg-transparent border hrule px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-accent"
          />
          {q && (
            <div className="mt-2 border hrule divide-y hrule max-h-72 overflow-auto">
              {matches.length === 0 && <div className="px-3 py-2 text-xs text-muted dark:text-muted-dark">No matches</div>}
              {matches.map(m => (
                <button
                  key={m.email}
                  onClick={() => { onPick(m.email); setQ(''); }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-ink/[0.04] dark:hover:bg-ink-dark/[0.05]"
                >
                  <div className="font-medium">{m.name}</div>
                  <div className="text-[11px] text-muted dark:text-muted-dark num">
                    {m.email} · Batch {m.batch} · {m.area} · {m.role}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        {selected && (
          <button className="btn-ghost" onClick={() => onPick(null)}>CLEAR</button>
        )}
      </div>
    </Section>
  );
}

function Profile({ p }: { p: EmployeeProfile }) {
  return (
    <>
      <Header p={p} />
      <Timeline p={p} />
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-6"><Scorecard p={p} /></div>
        <div className="col-span-6"><TeamCompare p={p} /></div>
      </div>
      <ActionItems p={p} />
      <ScoreTable p={p} />
    </>
  );
}

function Header({ p }: { p: EmployeeProfile }) {
  const e = p.employee;
  return (
    <section className="border-y hrule py-5">
      <div className="flex items-baseline gap-6">
        <div className="flex-1">
          <div className="text-2xl font-semibold tracking-tight">{e.name}</div>
          <div className="text-[12px] text-muted dark:text-muted-dark num">
            {e.email} · {e.area} · {ZONE_BY_BATCH[e.batch].zone}
          </div>
        </div>
        <Stat label="Batch"        value={`${e.batch}`} />
        <Stat label="Role"         value={e.role}
              tone={e.role === 'Exit' ? 'bad' : undefined} />
        <Stat label="Avg Score"    value={p.avgScore != null ? `${p.avgScore.toFixed(1)} / 10` : '—'}
              tone={p.band === 'weak' ? 'bad' : p.band === 'ok' ? 'avg' : p.band ? 'good' : undefined} />
        <Stat label="Attendance"   value={p.attendancePct != null ? `${p.attendancePct.toFixed(1)}%` : '—'}
              tone={p.attendancePct == null ? undefined : p.attendancePct < 70 ? 'bad' : p.attendancePct < 85 ? 'avg' : 'good'} />
        <Stat label="Missed"       value={`${p.sessionsMissed}`}
              tone={p.sessionsMissed === 0 ? 'good' : p.sessionsMissed >= 2 ? 'bad' : 'avg'} />
        <Stat label="Action Items" value={`${p.actionItems.length}`}
              tone={p.actionItems.length === 0 ? 'good' : 'bad'} />
      </div>
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'bad' | 'avg' | 'good' }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-[100px]">
      <div className="label-xs">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <div className="num text-xl font-semibold">{value}</div>
        {tone && <span className={`inline-block w-1.5 h-1.5 rounded-full
          ${tone === 'bad' ? 'bg-bad' : tone === 'avg' ? 'bg-avg' : 'bg-good'}`} />}
      </div>
    </div>
  );
}

function Timeline({ p }: { p: EmployeeProfile }) {
  return (
    <Section
      title="Attendance Timeline"
      hint={<InfoTip>One slot per session. ✓ present · ✗ absent · ↻ rescheduled · ○ upcoming.</InfoTip>}
    >
      <div className="border hrule p-3 grid grid-cols-10 gap-2">
        {p.attendanceTimeline.map(t => {
          const icon = t.status === 'present' ? '✓'
                     : t.status === 'absent'  ? '✗'
                     : t.status === 'rescheduled' ? '↻'
                     : '○';
          const cls  = t.status === 'present' ? 'border-good text-good bg-good/5'
                     : t.status === 'absent'  ? 'border-bad text-bad bg-bad/5'
                     : t.status === 'rescheduled' ? 'border-accent text-accent bg-accent/5'
                     : 'border-line dark:border-line-dark text-muted dark:text-muted-dark';
          return (
            <div key={t.sessionNumber} className={`border ${cls} px-2 py-2 flex flex-col items-center gap-0.5`}>
              <div className="text-lg leading-none num">{icon}</div>
              <div className="text-[10px] num">S{t.sessionNumber}</div>
              <div className="text-[9px] text-muted dark:text-muted-dark text-center leading-tight">{t.sessionCode}</div>
              {t.date && <div className="text-[9px] num text-muted dark:text-muted-dark">{t.date.slice(5)}</div>}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function Scorecard({ p }: { p: EmployeeProfile }) {
  const data = p.perCompetency.map(c => ({ competency: c.competency, score: c.score ?? 0 }));
  return (
    <Section
      title="Competency Scorecard"
      hint={<InfoTip>10 competencies as a radar. Larger shape = stronger across the board.</InfoTip>}
    >
      <div className="border hrule p-3 h-72 bg-bg dark:bg-bg-dark">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart outerRadius="78%" data={data}>
            <PolarGrid stroke="currentColor" strokeOpacity={0.15} />
            <PolarAngleAxis dataKey="competency" tick={{ fontSize: 9, fill: 'currentColor' }} />
            <Radar dataKey="score" stroke="#0D9488" fill="#0D9488" fillOpacity={0.25} />
            <RTooltip
              contentStyle={{ fontSize: 12, background: 'rgba(10,10,10,0.92)', color: '#fff', border: 'none' }}
              formatter={(v: any) => [`${v} / 10`, 'Score']}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </Section>
  );
}

function TeamCompare({ p }: { p: EmployeeProfile & { teamLabel: string } }) {
  const data = p.teamComparison.map(c => ({
    name: c.competency.split(' ').slice(0, 2).join(' '),
    me: c.me ?? 0,
    team: c.team ?? 0,
  }));
  return (
    <Section
      title={<>vs {p.teamLabel}</>}
      hint={<InfoTip>
        Per-competency comparison: this employee's score (teal) vs their team's
        average (grey). A short teal bar next to a tall grey bar is a flag.
      </InfoTip>}
    >
      <div className="border hrule p-3 h-72 bg-bg dark:bg-bg-dark">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 24, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} />
            <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'currentColor' }} interval={0} angle={-30} textAnchor="end" />
            <YAxis domain={[0, 10]} tick={{ fontSize: 10, fill: 'currentColor' }} />
            <RTooltip contentStyle={{ fontSize: 12, background: 'rgba(10,10,10,0.92)', color: '#fff', border: 'none' }} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Bar dataKey="me"   name={p.employee.name.split(' ')[0]} fill="#0D9488" />
            <Bar dataKey="team" name="Team avg" fill="#6B7280" fillOpacity={0.6} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Section>
  );
}

function ActionItems({ p }: { p: EmployeeProfile }) {
  return (
    <Section
      title="Action Items"
      hint={<InfoTip>Auto-generated from missed sessions and bad competency scores. Each item is something a Reporting Manager should resolve.</InfoTip>}
      right={`${p.actionItems.length} items`}
    >
      {p.actionItems.length === 0 ? <Empty message="No action items. Employee is on track." /> : (
        <ol className="border hrule divide-y hrule">
          {p.actionItems.map((a, i) => (
            <li key={i} className="cell-pad flex items-baseline gap-3">
              <span className="num text-[10px] text-muted dark:text-muted-dark w-6">{String(i + 1).padStart(2, '0')}</span>
              <span className="text-sm">{a}</span>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

function ScoreTable({ p }: { p: EmployeeProfile }) {
  return (
    <Section title="All Scores">
      <div className="border hrule">
        <table className="w-full text-sm">
          <thead>
            <tr className="label-xs border-b hrule text-left">
              <th className="cell-pad font-normal w-[60%]">Competency</th>
              <th className="cell-pad font-normal w-[15%] text-right">Score</th>
              <th className="cell-pad font-normal w-[25%]">Band</th>
            </tr>
          </thead>
          <tbody>
            {p.perCompetency.map(c => (
              <tr key={c.competency} className="border-b hrule last:border-b-0">
                <td className="cell-pad font-medium">{c.competency}</td>
                <td className="cell-pad text-right"><ScoreCell score={c.score} band={c.band} /></td>
                <td className="cell-pad">
                  {c.band
                    ? <span className="inline-flex items-center gap-2 text-[12px]">
                        <span className="inline-block w-2 h-2" style={{ background: BAND_COLOR[c.band] }} />
                        {c.band.toUpperCase()}
                      </span>
                    : <span className="text-muted dark:text-muted-dark text-[12px]">NOT ASSESSED</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
