import { createClient } from '@supabase/supabase-js';
const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = url && anon ? createClient(url, anon) : null;
export async function loadAll() {
    if (!supabase)
        throw new Error('Supabase env vars missing — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
    const [empRes, sessRes, bsRes, attRes, asmRes] = await Promise.all([
        supabase.from('employees').select('*'),
        supabase.from('sessions').select('*').order('session_number'),
        supabase.from('batch_sessions').select('*'),
        supabase.from('attendance').select('*'),
        supabase.from('assessments').select('*').eq('is_reassessment', false),
    ]);
    for (const r of [empRes, sessRes, bsRes, attRes, asmRes]) {
        if (r.error)
            throw r.error;
    }
    const sessionsById = new Map();
    const sessions = (sessRes.data ?? []).map(r => {
        const s = {
            sessionNumber: r.session_number,
            sessionCode: r.session_code,
            topic: r.topic,
            sessionType: r.session_type,
        };
        sessionsById.set(r.id, s);
        return s;
    });
    const employees = (empRes.data ?? []).map(e => ({
        email: e.email,
        name: e.name,
        batch: e.batch,
        zone: e.zone,
        area: e.area,
        role: e.role,
        reportingManager: e.reporting_manager,
        isActive: e.is_active,
    }));
    const empById = new Map(empRes.data.map(e => [e.id, e.email]));
    const batchSessions = (bsRes.data ?? []).map(b => ({
        sessionNumber: sessionsById.get(b.session_id).sessionNumber,
        batch: b.batch,
        scheduledDate: b.scheduled_date,
        trainerName: b.trainer_name,
        timeSlot: b.time_slot,
        status: b.status,
    }));
    const attendance = (attRes.data ?? []).map(a => ({
        email: empById.get(a.employee_id) ?? '',
        sessionNumber: sessionsById.get(a.session_id).sessionNumber,
        batch: a.batch,
        status: a.status,
    }));
    const assessments = (asmRes.data ?? []).map(a => ({
        email: empById.get(a.employee_id) ?? '',
        sessionNumber: sessionsById.get(a.session_id).sessionNumber,
        competency: a.competency,
        score: a.score,
    }));
    return { employees, sessions, batchSessions, attendance, assessments };
}
