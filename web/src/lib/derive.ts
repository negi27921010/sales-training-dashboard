import {
  AssessmentRow,
  AttendanceRow,
  BATCHES,
  Band,
  BatchSession,
  COMPETENCIES,
  Employee,
  SessionDef,
  TOTAL_TRAINING_SESSIONS,
  bandOf,
} from '../types';

export interface Dataset {
  employees: Employee[];
  sessions: SessionDef[];
  batchSessions: BatchSession[];
  attendance: AttendanceRow[];
  assessments: AssessmentRow[];
}

export interface EmployeeSummary {
  employee: Employee;
  sessionsAttended: number;
  sessionsHeld: number;       // 'present' + 'absent' + 'rescheduled' + 'excused'
  sessionsMissed: number;
  attendancePct: number | null;
  avgScore: number | null;
  band: Band | null;
  badCount: number;
  perfectCount: number;
  worstCompetency: { competency: string; score: number } | null;
}

export interface ProgramKpis {
  sessionsCompleted: number;        // fully delivered across all 5 batches
  sessionsTotal: number;            // = TOTAL_TRAINING_SESSIONS (10)
  sessionsInProgress: number;       // at least 1 batch done, but not all
  overallAttendancePct: number;
  avgAssessmentScore: number | null;
  employeesAtRisk: number;
  trainerUtilizationPct: number;
  activeEmployees: number;
}

export function summarizeEmployees(ds: Dataset): EmployeeSummary[] {
  const summaries: EmployeeSummary[] = [];
  for (const emp of ds.employees) {
    const myAtt = ds.attendance.filter(
      a => a.email === emp.email && a.sessionNumber <= TOTAL_TRAINING_SESSIONS,
    );
    const held    = myAtt.filter(a => a.status === 'present' || a.status === 'absent' || a.status === 'rescheduled' || a.status === 'excused');
    const present = myAtt.filter(a => a.status === 'present').length;
    const missed  = myAtt.filter(a => a.status === 'absent').length;
    const pct = held.length === 0 ? null : Math.round((present / held.length) * 1000) / 10;

    const myAsm = ds.assessments.filter(a => a.email === emp.email && a.score != null);
    const avg = myAsm.length === 0 ? null
      : Math.round((myAsm.reduce((s, x) => s + (x.score as number), 0) / myAsm.length) * 10) / 10;
    const bad = myAsm.filter(a => bandOf(a.score) === 'weak').length;
    const perfect = myAsm.filter(a => bandOf(a.score) === 'excellent').length;
    const worst = myAsm.length === 0 ? null
      : myAsm.reduce((w, x) => (w == null || (x.score as number) < w.score
          ? { competency: x.competency, score: x.score as number } : w),
          null as { competency: string; score: number } | null);

    summaries.push({
      employee: emp,
      sessionsAttended: present,
      sessionsHeld: held.length,
      sessionsMissed: missed,
      attendancePct: pct,
      avgScore: avg,
      band: bandOf(avg),
      badCount: bad,
      perfectCount: perfect,
      worstCompetency: worst,
    });
  }
  return summaries;
}

export function computeKpis(ds: Dataset, summaries: EmployeeSummary[]): ProgramKpis {
  const active = ds.employees.filter(e => e.isActive);

  // Per-session completion: a session is fully completed when every batch (1..5)
  // that has a planned row for it shows status='completed'.  This avoids
  // penalising sessions whose batch rows haven't been published yet, while still
  // requiring real cross-batch delivery before we call it done.
  let sessionsCompleted = 0;
  let sessionsInProgress = 0;
  for (let n = 1; n <= TOTAL_TRAINING_SESSIONS; n++) {
    const batchRows = ds.batchSessions.filter(b => b.sessionNumber === n);
    if (batchRows.length === 0) continue;
    const done = batchRows.filter(b => b.status === 'completed').length;
    if (done === BATCHES.length) sessionsCompleted++;
    else if (done > 0)            sessionsInProgress++;
  }

  // Attendance: only count cells inside the 10-session training window.
  const allAtt = ds.attendance.filter(
    a => a.sessionNumber <= TOTAL_TRAINING_SESSIONS
      && (a.status === 'present' || a.status === 'absent'),
  );
  const present = allAtt.filter(a => a.status === 'present').length;
  const overallAttendancePct = allAtt.length === 0
    ? 0
    : Math.round((present / allAtt.length) * 1000) / 10;

  const scored = ds.assessments.filter(a => a.score != null);
  const avg = scored.length === 0
    ? null
    : Math.round((scored.reduce((s, x) => s + (x.score as number), 0) / scored.length) * 10) / 10;

  const atRisk = summaries.filter(s =>
    s.employee.isActive && (s.badCount > 0 || (s.sessionsMissed >= 2))).length;

  // Trainer utilization restricted to the 10-session window too.
  const inWindow = ds.batchSessions.filter(b => b.sessionNumber <= TOTAL_TRAINING_SESSIONS);
  const assigned = inWindow.filter(b => b.trainerName).length;
  const delivered = inWindow.filter(b => b.status === 'completed' && b.trainerName).length;
  const util = assigned === 0 ? 0 : Math.round((delivered / assigned) * 1000) / 10;

  return {
    sessionsCompleted,
    sessionsInProgress,
    sessionsTotal: TOTAL_TRAINING_SESSIONS,
    overallAttendancePct,
    avgAssessmentScore: avg,
    employeesAtRisk: atRisk,
    trainerUtilizationPct: util,
    activeEmployees: active.length,
  };
}

// ─── Session-centric status ────────────────────────────────────────────────
// One row per session; per-batch delivery indicator + cross-batch rollups.
export interface BatchDot {
  batch: number;
  state: 'completed' | 'scheduled' | 'missing';
  date: string | null;
  trainer: string | null;
  attendancePct: number | null;
}

export interface SessionStatus {
  sessionNumber: number;
  sessionCode: string;
  topic: string;
  sessionType: SessionDef['sessionType'];
  batches: BatchDot[];                  // length = 5
  batchesCompleted: number;             // 0..5
  isFullyComplete: boolean;
  attendancePresent: number;
  attendanceTotal: number;              // present + absent across all batches
  attendancePct: number | null;
  avgScore: number | null;              // null until any assessment exists for this session
  trainers: string[];                   // distinct, alphabetised
  nextDate: string | null;              // earliest future date for any batch
}

export function computeSessionStatus(ds: Dataset): SessionStatus[] {
  const out: SessionStatus[] = [];
  for (let n = 1; n <= TOTAL_TRAINING_SESSIONS; n++) {
    const sess = ds.sessions.find(s => s.sessionNumber === n);
    if (!sess) continue;
    const rows = ds.batchSessions.filter(b => b.sessionNumber === n);

    const batches: BatchDot[] = BATCHES.map(b => {
      const r = rows.find(x => x.batch === b);
      const myAtt = ds.attendance.filter(
        a => a.batch === b && a.sessionNumber === n
          && (a.status === 'present' || a.status === 'absent'),
      );
      const p = myAtt.filter(a => a.status === 'present').length;
      return {
        batch: b,
        state: r?.status === 'completed' ? 'completed'
             : r ? 'scheduled' : 'missing',
        date: r?.scheduledDate ?? null,
        trainer: r?.trainerName ?? null,
        attendancePct: myAtt.length === 0 ? null
          : Math.round((p / myAtt.length) * 1000) / 10,
      };
    });

    const att = ds.attendance.filter(
      a => a.sessionNumber === n
        && (a.status === 'present' || a.status === 'absent'),
    );
    const present = att.filter(a => a.status === 'present').length;

    const asm = ds.assessments.filter(a => a.sessionNumber === n && a.score != null);
    const avg = asm.length === 0
      ? null
      : Math.round((asm.reduce((s, x) => s + (x.score as number), 0) / asm.length) * 10) / 10;

    const trainers = Array.from(new Set(rows.map(r => r.trainerName).filter(Boolean) as string[])).sort();

    const future = rows
      .filter(r => r.status === 'scheduled' && r.scheduledDate)
      .map(r => r.scheduledDate as string)
      .sort();

    const batchesCompleted = batches.filter(b => b.state === 'completed').length;

    out.push({
      sessionNumber: n,
      sessionCode: sess.sessionCode,
      topic: sess.topic,
      sessionType: sess.sessionType,
      batches,
      batchesCompleted,
      isFullyComplete: batchesCompleted === BATCHES.length,
      attendancePresent: present,
      attendanceTotal: att.length,
      attendancePct: att.length === 0 ? null
        : Math.round((present / att.length) * 1000) / 10,
      avgScore: avg,
      trainers,
      nextDate: future[0] ?? null,
    });
  }
  return out;
}

// "Attention Required" rows.
export interface AttentionRow {
  email: string;
  name: string;
  batch: number;
  reportingManager: string | null;
  severity: number;          // higher = more urgent
  issue: string;
}

export function computeAttention(summaries: EmployeeSummary[]): AttentionRow[] {
  const rows: AttentionRow[] = [];
  for (const s of summaries) {
    if (!s.employee.isActive) continue;
    const issues: { text: string; weight: number }[] = [];

    if (s.sessionsMissed >= 3) issues.push({ text: `Absent ${s.sessionsMissed}/${s.sessionsHeld} sessions`, weight: 100 + s.sessionsMissed * 10 });
    else if (s.sessionsMissed >= 2) issues.push({ text: `Missed ${s.sessionsMissed} sessions`, weight: 60 });
    else if (s.sessionsMissed === 1) issues.push({ text: '1 absence — retraining needed', weight: 30 });

    if (s.badCount > 0 && s.worstCompetency)
      issues.push({
        text: `${s.worstCompetency.competency}: ${s.worstCompetency.score}`,
        weight: 80 + (3 - s.worstCompetency.score) * 10,
      });

    if (s.attendancePct != null && s.attendancePct < 50)
      issues.push({ text: `Attendance ${s.attendancePct}%`, weight: 90 });

    if (issues.length === 0) continue;
    issues.sort((a, b) => b.weight - a.weight);
    rows.push({
      email: s.employee.email,
      name: s.employee.name,
      batch: s.employee.batch,
      reportingManager: s.employee.reportingManager,
      severity: issues[0].weight,
      issue: issues.map(i => i.text).join(' · '),
    });
  }
  return rows.sort((a, b) => b.severity - a.severity);
}

export function competencyAggregate(ds: Dataset): { competency: string; avg: number | null; assessed: number }[] {
  return COMPETENCIES.map(c => {
    const scored = ds.assessments.filter(a => a.competency === c && a.score != null);
    const avg = scored.length === 0
      ? null
      : Math.round((scored.reduce((s, x) => s + (x.score as number), 0) / scored.length) * 10) / 10;
    return { competency: c, avg, assessed: scored.length };
  });
}
