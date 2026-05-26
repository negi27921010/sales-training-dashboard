import { Dataset } from './derive';
import { Action, RetrainingAction, findRetraining } from './actions';
import { COMPETENCIES, bandOf } from '../types';

// ─── Retraining intelligence (per-person, clubbed) ─────────────────────────
export interface MissedSessionItem {
  sessionNumber: number;
  sessionCode: string;
  topic: string;
  homeBatchDate: string | null;
  /**
   * Future batches that still have this session scheduled with a date >= today.
   * The user can pick one to "reschedule" the missed session into.
   */
  reassignmentOptions: { batch: number; date: string; trainer: string | null }[];
  action: RetrainingAction | null;
}

export interface DefaulterIntel {
  email: string;
  name: string;
  batch: number;
  area: string;
  reportingManager: string | null;
  totalMissed: number;
  totalUnscheduled: number;             // missed AND no retraining action
  totalDefaulted: number;               // assigned to retraining but marked no_show
  riskScore: number;                    // higher = more critical
  riskLabel: 'CHRONIC' | 'AT RISK' | 'WATCH' | 'OK';
  missed: MissedSessionItem[];
}

export function buildDefaulterIntel(ds: Dataset, actions: Action[]): DefaulterIntel[] {
  // Group absences by email
  const byEmail = new Map<string, { rows: typeof ds.attendance }>();
  for (const a of ds.attendance) {
    if (a.status !== 'absent') continue;
    const cur = byEmail.get(a.email) ?? { rows: [] as typeof ds.attendance };
    cur.rows.push(a);
    byEmail.set(a.email, cur);
  }

  const today = new Date().toISOString().slice(0, 10);
  const out: DefaulterIntel[] = [];

  for (const [email, { rows }] of byEmail.entries()) {
    const emp = ds.employees.find(e => e.email === email);
    if (!emp) continue;

    const missed: MissedSessionItem[] = [];
    for (const r of rows) {
      const sess = ds.sessions.find(s => s.sessionNumber === r.sessionNumber);
      if (!sess) continue;
      const homeBs = ds.batchSessions.find(b => b.sessionNumber === r.sessionNumber && b.batch === emp.batch);

      // Reassignment options: another batch where this session is still in the future
      const options = ds.batchSessions
        .filter(b =>
          b.sessionNumber === r.sessionNumber
          && b.batch !== emp.batch
          && b.scheduledDate
          && b.scheduledDate >= today,
        )
        .sort((a, b) => (a.scheduledDate ?? '').localeCompare(b.scheduledDate ?? ''))
        .map(b => ({ batch: b.batch, date: b.scheduledDate as string, trainer: b.trainerName }));

      const action = findRetraining(actions, email, r.sessionNumber);

      missed.push({
        sessionNumber: r.sessionNumber,
        sessionCode: sess.sessionCode,
        topic: sess.topic,
        homeBatchDate: homeBs?.scheduledDate ?? null,
        reassignmentOptions: options,
        action,
      });
    }

    missed.sort((a, b) => a.sessionNumber - b.sessionNumber);

    const totalMissed       = missed.length;
    const totalUnscheduled  = missed.filter(m => !m.action || m.action.status === 'pending' && new Date(m.action.assignedDate) < new Date()).length;
    const totalDefaulted    = missed.filter(m => m.action?.status === 'no_show').length;

    // Risk: 30/miss + 50/no_show + 20/unscheduled
    const risk = totalMissed * 30 + totalDefaulted * 50 + totalUnscheduled * 20;
    const riskLabel: DefaulterIntel['riskLabel'] =
      totalDefaulted >= 2 || risk >= 200 ? 'CHRONIC'
      : totalMissed >= 3 || risk >= 100  ? 'AT RISK'
      : totalMissed >= 1                  ? 'WATCH'
      : 'OK';

    out.push({
      email, name: emp.name, batch: emp.batch, area: emp.area,
      reportingManager: emp.reportingManager,
      totalMissed, totalUnscheduled, totalDefaulted,
      riskScore: risk, riskLabel, missed,
    });
  }

  return out.sort((a, b) => b.riskScore - a.riskScore || a.name.localeCompare(b.name));
}

// ─── Assessment intelligence (per-person, clubbed) ─────────────────────────
export interface BadCompetencyItem {
  competency: string;
  score: number;
  // Future sessions where this employee will see this assessment again
  nextSessionDate: string | null;
}

export interface ReAssessmentIntel {
  email: string;
  name: string;
  batch: number;
  reportingManager: string | null;
  avgScore: number | null;
  worstCompetency: { competency: string; score: number };
  weakCompetencies: BadCompetencyItem[];   // any score <= 2
  scheduledCount: number;
  completedCount: number;
}

export function buildReAssessmentIntel(ds: Dataset, actions: Action[]): ReAssessmentIntel[] {
  const out: ReAssessmentIntel[] = [];
  const byEmail = new Map<string, typeof ds.assessments>();
  for (const a of ds.assessments) {
    if (a.score == null) continue;
    if (bandOf(a.score) !== 'weak') continue;
    (byEmail.get(a.email) ?? byEmail.set(a.email, []).get(a.email)!).push(a);
  }
  for (const [email, rows] of byEmail.entries()) {
    const emp = ds.employees.find(e => e.email === email);
    if (!emp || emp.role === 'Exit') continue;

    // Best representative per competency = lowest score
    const byComp = new Map<string, number>();
    for (const r of rows) {
      const cur = byComp.get(r.competency);
      if (cur == null || (r.score as number) < cur) byComp.set(r.competency, r.score as number);
    }

    const weakCompetencies: BadCompetencyItem[] = Array.from(byComp.entries()).map(([competency, score]) => ({
      competency,
      score,
      nextSessionDate: null,            // placeholder — could be tied to a session that assesses this competency
    }));

    if (weakCompetencies.length === 0) continue;
    weakCompetencies.sort((a, b) => a.score - b.score);
    const worst = weakCompetencies[0];

    // avg score (across whatever is scored)
    const allScored = ds.assessments.filter(a => a.email === email && a.score != null);
    const avg = allScored.length === 0 ? null
      : Math.round((allScored.reduce((s, x) => s + (x.score as number), 0) / allScored.length) * 10) / 10;

    const myActions = actions.filter(a => a.kind === 'reassessment' && a.email === email);
    const scheduledCount = myActions.filter(a => a.kind === 'reassessment' && (a as any).status === 'scheduled').length;
    const completedCount = myActions.filter(a => a.kind === 'reassessment' && (a as any).status === 'completed').length;

    out.push({
      email, name: emp.name, batch: emp.batch,
      reportingManager: emp.reportingManager,
      avgScore: avg,
      worstCompetency: { competency: worst.competency, score: worst.score },
      weakCompetencies,
      scheduledCount, completedCount,
    });
  }
  return out.sort((a, b) => a.worstCompetency.score - b.worstCompetency.score || b.weakCompetencies.length - a.weakCompetencies.length);
}

// ─── "Trainer should grade" — sessions that happened with no assessments ──
export interface UngradedSlot {
  sessionNumber: number;
  sessionCode: string;
  batch: number;
  trainer: string | null;
  date: string | null;
  attendedCount: number;
  assessedCount: number;
}
export function findUngradedSessions(ds: Dataset): UngradedSlot[] {
  const out: UngradedSlot[] = [];
  for (const bs of ds.batchSessions) {
    if (bs.status !== 'completed') continue;
    const peopleInBatch = ds.employees.filter(e => e.batch === bs.batch);
    const attended = ds.attendance.filter(
      a => a.sessionNumber === bs.sessionNumber && a.batch === bs.batch && a.status === 'present',
    ).map(a => a.email);
    if (attended.length === 0) continue;
    // Were any of these people scored on ANY competency for this session?
    const assessedSet = new Set(
      ds.assessments
        .filter(a => a.sessionNumber === bs.sessionNumber && a.score != null && attended.includes(a.email))
        .map(a => a.email),
    );
    if (assessedSet.size >= attended.length * 0.5) continue;          // mostly graded → skip
    const sess = ds.sessions.find(s => s.sessionNumber === bs.sessionNumber);
    if (!sess) continue;
    out.push({
      sessionNumber: sess.sessionNumber,
      sessionCode: sess.sessionCode,
      batch: bs.batch,
      trainer: bs.trainerName,
      date: bs.scheduledDate,
      attendedCount: attended.length,
      assessedCount: assessedSet.size,
    });
    void peopleInBatch;
  }
  return out.sort((a, b) => (b.attendedCount - b.assessedCount) - (a.attendedCount - a.assessedCount));
}

// ─── Per-person score trend across sessions ────────────────────────────────
export interface ScoreTrendPoint {
  sessionNumber: number;
  sessionCode: string;
  avgScore: number | null;
  byCompetency: Record<string, number | null>;
}
export function buildScoreTrend(ds: Dataset, email: string): ScoreTrendPoint[] {
  return ds.sessions
    .slice()
    .sort((a, b) => a.sessionNumber - b.sessionNumber)
    .map(s => {
      const rows = ds.assessments.filter(a => a.email === email && a.sessionNumber === s.sessionNumber);
      const scored = rows.filter(r => r.score != null);
      const avg = scored.length === 0 ? null
        : Math.round((scored.reduce((sum, r) => sum + (r.score as number), 0) / scored.length) * 10) / 10;
      const byCompetency: Record<string, number | null> = {};
      for (const c of COMPETENCIES) {
        const r = rows.find(x => x.competency === c);
        byCompetency[c] = r?.score ?? null;
      }
      return { sessionNumber: s.sessionNumber, sessionCode: s.sessionCode, avgScore: avg, byCompetency };
    });
}
