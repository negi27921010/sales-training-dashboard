import { findRetraining } from './actions';
import { COMPETENCIES, bandOf } from '../types';
export function buildDefaulterIntel(ds, actions) {
    // Group absences by email
    const byEmail = new Map();
    for (const a of ds.attendance) {
        if (a.status !== 'absent')
            continue;
        const cur = byEmail.get(a.email) ?? { rows: [] };
        cur.rows.push(a);
        byEmail.set(a.email, cur);
    }
    const today = new Date().toISOString().slice(0, 10);
    const out = [];
    for (const [email, { rows }] of byEmail.entries()) {
        const emp = ds.employees.find(e => e.email === email);
        if (!emp)
            continue;
        const missed = [];
        for (const r of rows) {
            const sess = ds.sessions.find(s => s.sessionNumber === r.sessionNumber);
            if (!sess)
                continue;
            const homeBs = ds.batchSessions.find(b => b.sessionNumber === r.sessionNumber && b.batch === emp.batch);
            // Reassignment options: another batch where this session is still in the future
            const options = ds.batchSessions
                .filter(b => b.sessionNumber === r.sessionNumber
                && b.batch !== emp.batch
                && b.scheduledDate
                && b.scheduledDate >= today)
                .sort((a, b) => (a.scheduledDate ?? '').localeCompare(b.scheduledDate ?? ''))
                .map(b => ({ batch: b.batch, date: b.scheduledDate, trainer: b.trainerName }));
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
        const totalMissed = missed.length;
        const totalUnscheduled = missed.filter(m => !m.action || m.action.status === 'pending' && new Date(m.action.assignedDate) < new Date()).length;
        const totalDefaulted = missed.filter(m => m.action?.status === 'no_show').length;
        // Risk: 30/miss + 50/no_show + 20/unscheduled
        const risk = totalMissed * 30 + totalDefaulted * 50 + totalUnscheduled * 20;
        const riskLabel = totalDefaulted >= 2 || risk >= 200 ? 'CHRONIC'
            : totalMissed >= 3 || risk >= 100 ? 'AT RISK'
                : totalMissed >= 1 ? 'WATCH'
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
export function buildReAssessmentIntel(ds, actions) {
    const out = [];
    const byEmail = new Map();
    for (const a of ds.assessments) {
        if (a.score == null)
            continue;
        if (bandOf(a.score) !== 'weak')
            continue;
        (byEmail.get(a.email) ?? byEmail.set(a.email, []).get(a.email)).push(a);
    }
    for (const [email, rows] of byEmail.entries()) {
        const emp = ds.employees.find(e => e.email === email);
        if (!emp || emp.role === 'Exit')
            continue;
        // Best representative per competency = lowest score
        const byComp = new Map();
        for (const r of rows) {
            const cur = byComp.get(r.competency);
            if (cur == null || r.score < cur)
                byComp.set(r.competency, r.score);
        }
        const weakCompetencies = Array.from(byComp.entries()).map(([competency, score]) => ({
            competency,
            score,
            nextSessionDate: null, // placeholder — could be tied to a session that assesses this competency
        }));
        if (weakCompetencies.length === 0)
            continue;
        weakCompetencies.sort((a, b) => a.score - b.score);
        const worst = weakCompetencies[0];
        // avg score (across whatever is scored)
        const allScored = ds.assessments.filter(a => a.email === email && a.score != null);
        const avg = allScored.length === 0 ? null
            : Math.round((allScored.reduce((s, x) => s + x.score, 0) / allScored.length) * 10) / 10;
        const myActions = actions.filter(a => a.kind === 'reassessment' && a.email === email);
        const scheduledCount = myActions.filter(a => a.kind === 'reassessment' && a.status === 'scheduled').length;
        const completedCount = myActions.filter(a => a.kind === 'reassessment' && a.status === 'completed').length;
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
export function findUngradedSessions(ds) {
    const out = [];
    for (const bs of ds.batchSessions) {
        if (bs.status !== 'completed')
            continue;
        const peopleInBatch = ds.employees.filter(e => e.batch === bs.batch);
        const attended = ds.attendance.filter(a => a.sessionNumber === bs.sessionNumber && a.batch === bs.batch && a.status === 'present').map(a => a.email);
        if (attended.length === 0)
            continue;
        // Were any of these people scored on ANY competency for this session?
        const assessedSet = new Set(ds.assessments
            .filter(a => a.sessionNumber === bs.sessionNumber && a.score != null && attended.includes(a.email))
            .map(a => a.email));
        if (assessedSet.size >= attended.length * 0.5)
            continue; // mostly graded → skip
        const sess = ds.sessions.find(s => s.sessionNumber === bs.sessionNumber);
        if (!sess)
            continue;
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
export function buildScoreTrend(ds, email) {
    return ds.sessions
        .slice()
        .sort((a, b) => a.sessionNumber - b.sessionNumber)
        .map(s => {
        const rows = ds.assessments.filter(a => a.email === email && a.sessionNumber === s.sessionNumber);
        const scored = rows.filter(r => r.score != null);
        const avg = scored.length === 0 ? null
            : Math.round((scored.reduce((sum, r) => sum + r.score, 0) / scored.length) * 10) / 10;
        const byCompetency = {};
        for (const c of COMPETENCIES) {
            const r = rows.find(x => x.competency === c);
            byCompetency[c] = r?.score ?? null;
        }
        return { sessionNumber: s.sessionNumber, sessionCode: s.sessionCode, avgScore: avg, byCompetency };
    });
}
