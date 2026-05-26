import { BATCHES, COMPETENCIES, ZONE_BY_BATCH, bandOf, } from '../types';
export function drillSession(ds, sessionNumber, grouping) {
    // Per-batch facts about this session (from the Calendar) — needed regardless
    // of grouping, since trainer + date come from there.
    const batchFacts = new Map();
    for (const b of BATCHES) {
        const bs = ds.batchSessions.find(x => x.sessionNumber === sessionNumber && x.batch === b);
        batchFacts.set(b, {
            trainer: bs?.trainerName ?? null,
            date: bs?.scheduledDate ?? null,
            state: bs?.status === 'completed' ? 'completed'
                : bs ? 'scheduled' : 'missing',
        });
    }
    // The "ZM" of a batch = whichever roster row in that batch carries role='ZM'.
    const zmByBatch = new Map();
    for (const b of BATCHES) {
        zmByBatch.set(b, ds.employees.find(e => e.batch === b && e.role === 'ZM') ?? null);
    }
    // Build per-employee detail row scoped to *this* session.
    const detailFor = (emp) => {
        const att = ds.attendance.find(a => a.email === emp.email && a.sessionNumber === sessionNumber);
        const scores = COMPETENCIES.map(c => {
            const r = ds.assessments.find(a => a.email === emp.email && a.sessionNumber === sessionNumber && a.competency === c);
            return { competency: c, score: r?.score ?? null };
        });
        const valid = scores.map(s => s.score).filter((s) => s != null);
        const avg = valid.length === 0 ? null
            : Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 10) / 10;
        // Whole-program rollup (used in the people-row context)
        const allAtt = ds.attendance.filter(a => a.email === emp.email);
        const held = allAtt.filter(a => a.status === 'present' || a.status === 'absent').length;
        const present = allAtt.filter(a => a.status === 'present').length;
        const missed = allAtt.filter(a => a.status === 'absent').length;
        return {
            email: emp.email,
            name: emp.name,
            role: emp.role,
            area: emp.area,
            batch: emp.batch,
            attendanceStatus: att?.status ?? null,
            scores,
            avgScore: avg,
            band: bandOf(avg),
            totalAttendancePct: held === 0 ? null : Math.round((present / held) * 1000) / 10,
            totalSessionsMissed: missed,
        };
    };
    // Group rows
    const groupKey = (emp) => {
        if (grouping === 'batch') {
            return {
                key: String(emp.batch),
                label: `BATCH ${emp.batch}`,
                sublabel: ZONE_BY_BATCH[emp.batch].zone,
            };
        }
        if (grouping === 'zone') {
            const z = ZONE_BY_BATCH[emp.batch].zone;
            return { key: z, label: z, sublabel: `Batch ${emp.batch}` };
        }
        // ZM
        const zm = zmByBatch.get(emp.batch);
        if (zm)
            return { key: zm.email, label: zm.name, sublabel: `Batch ${emp.batch} ZM · ${ZONE_BY_BATCH[emp.batch].zone}` };
        return { key: `batch-${emp.batch}-noZM`, label: `Batch ${emp.batch}`, sublabel: 'No ZM assigned' };
    };
    // Bucket employees → details
    const buckets = new Map();
    for (const emp of ds.employees) {
        const gk = groupKey(emp);
        if (!buckets.has(gk.key))
            buckets.set(gk.key, { meta: gk, batch: emp.batch, emps: [] });
        buckets.get(gk.key).emps.push(detailFor(emp));
    }
    const out = [];
    for (const { meta, batch, emps } of buckets.values()) {
        const present = emps.filter(e => e.attendanceStatus === 'present').length;
        const absent = emps.filter(e => e.attendanceStatus === 'absent').length;
        const valid = emps.map(e => e.avgScore).filter((s) => s != null);
        const avg = valid.length === 0 ? null
            : Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 10) / 10;
        const f = batchFacts.get(batch);
        const zm = zmByBatch.get(batch);
        out.push({
            key: meta.key,
            label: meta.label,
            sublabel: meta.sublabel,
            batch,
            zmName: zm?.name ?? null,
            trainer: f.trainer,
            date: f.date,
            state: f.state,
            totalEmployees: emps.length,
            present,
            absent,
            attendancePct: (present + absent) === 0 ? null
                : Math.round((present / (present + absent)) * 1000) / 10,
            avgScore: avg,
            band: bandOf(avg),
            employees: emps.sort((a, b) => a.name.localeCompare(b.name)),
        });
    }
    // Sort: Batch by number, ZM alphabetical, Zone alphabetical
    out.sort((a, b) => grouping === 'batch'
        ? a.batch - b.batch
        : a.label.localeCompare(b.label));
    return out;
}
export function buildProfile(ds, email) {
    const emp = ds.employees.find(e => e.email === email);
    if (!emp)
        return null;
    // Attendance timeline (sessions 1..N, sorted)
    const timeline = ds.sessions
        .slice()
        .sort((a, b) => a.sessionNumber - b.sessionNumber)
        .map(s => {
        const att = ds.attendance.find(a => a.email === email && a.sessionNumber === s.sessionNumber);
        const bs = ds.batchSessions.find(b => b.sessionNumber === s.sessionNumber && b.batch === emp.batch);
        return {
            sessionNumber: s.sessionNumber,
            sessionCode: s.sessionCode,
            status: att?.status ?? null,
            date: bs?.scheduledDate ?? null,
        };
    });
    const held = timeline.filter(t => t.status === 'present' || t.status === 'absent').length;
    const present = timeline.filter(t => t.status === 'present').length;
    const missed = timeline.filter(t => t.status === 'absent').length;
    // Per-competency (across all sessions; if multiple sessions assessed, average)
    const perCompetency = COMPETENCIES.map(c => {
        const rows = ds.assessments.filter(a => a.email === email && a.competency === c && a.score != null);
        if (rows.length === 0)
            return { competency: c, score: null, band: null };
        const avg = Math.round((rows.reduce((s, x) => s + x.score, 0) / rows.length) * 10) / 10;
        return { competency: c, score: avg, band: bandOf(avg) };
    });
    const validScores = perCompetency.map(p => p.score).filter((s) => s != null);
    const overall = validScores.length === 0 ? null
        : Math.round((validScores.reduce((a, b) => a + b, 0) / validScores.length) * 10) / 10;
    // Team comparison
    const teamPeers = emp.reportingManager
        ? ds.employees.filter(e => e.email !== email && (e.reportingManager ?? '').toLowerCase() === emp.reportingManager.toLowerCase())
        : ds.employees.filter(e => e.email !== email && e.batch === emp.batch);
    const teamScores = {};
    for (const peer of teamPeers) {
        for (const row of ds.assessments.filter(a => a.email === peer.email && a.score != null)) {
            (teamScores[row.competency] ??= []).push(row.score);
        }
    }
    const teamComparison = perCompetency.map(p => ({
        competency: p.competency,
        me: p.score,
        team: teamScores[p.competency]?.length
            ? Math.round((teamScores[p.competency].reduce((a, b) => a + b, 0) / teamScores[p.competency].length) * 10) / 10
            : null,
    }));
    const teamLabel = emp.reportingManager
        ? `${emp.reportingManager}'s team`
        : `Batch ${emp.batch} team`;
    // Auto action items
    const actionItems = [];
    for (const t of timeline) {
        if (t.status === 'absent') {
            actionItems.push(`Missed ${t.sessionCode}${t.date ? ` (${t.date})` : ''} — retraining not yet scheduled`);
        }
    }
    for (const p of perCompetency) {
        if (p.band === 'weak') {
            actionItems.push(`${p.competency}: ${p.score} — re-assessment required`);
        }
    }
    if (timeline.every(t => t.status == null) && validScores.length === 0) {
        actionItems.push('No data yet — first session not held.');
    }
    return {
        employee: emp,
        attendanceTimeline: timeline,
        attendancePct: held === 0 ? null : Math.round((present / held) * 1000) / 10,
        sessionsAttended: present,
        sessionsHeld: held,
        sessionsMissed: missed,
        perCompetency,
        avgScore: overall,
        band: bandOf(overall),
        actionItems,
        teamComparison,
        teamLabel,
    };
}
