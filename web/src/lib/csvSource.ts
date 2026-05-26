import Papa from 'papaparse';
import {
  AssessmentRow,
  AttendanceRow,
  BatchSession,
  COMPETENCIES,
  Employee,
  Role,
  SessionDef,
  ZONE_BY_BATCH,
} from '../types';

const SEED = '/seed';

async function fetchCsv(path: string): Promise<string[][]> {
  const text = await fetch(path).then(r => r.text());
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
  return parsed.data as string[][];
}

function parseExcelOrText(v: string): string | null {
  const s = (v || '').toString().trim();
  if (!s) return null;
  // Excel serial number
  const n = Number(s);
  if (Number.isFinite(n) && n > 1000) {
    const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
    return d.toISOString().slice(0, 10);
  }
  // m/d/yyyy
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m1) {
    const [, mo, da, y] = m1;
    return `${y}-${mo.padStart(2, '0')}-${da.padStart(2, '0')}`;
  }
  // "19 May" → assume current year
  const m2 = s.match(/^(\d{1,2})\s+([A-Za-z]+)$/);
  if (m2) {
    const months: Record<string, number> = {
      jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
      jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
    };
    const mm = months[m2[2].toLowerCase().slice(0, 3)];
    if (mm) {
      const y = new Date().getFullYear();
      return `${y}-${String(mm).padStart(2, '0')}-${m2[1].padStart(2, '0')}`;
    }
  }
  return null;
}

function normTrainer(v: string): string | null {
  const s = (v || '').toString().replace(/\s+/g, ' ').trim();
  if (!s) return null;
  return s
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());
}

function normSessionCode(v: string): string {
  return (v || '').toString().replace(/\s+/g, ' ').trim();
}

// ─── Public ────────────────────────────────────────────────────────────────
export async function loadAll() {
  const [calRows, attRows, asmRows] = await Promise.all([
    fetchCsv(`${SEED}/calendar.csv`),
    fetchCsv(`${SEED}/attendance.csv`),
    fetchCsv(`${SEED}/assessment.csv`),
  ]);

  // ── Calendar → sessions + batch_sessions
  const sessions: SessionDef[] = [];
  const batchSessions: BatchSession[] = [];
  // skip header rows; the gviz CSV puts the header on row 0
  const dataRows = calRows.slice(1).filter(r => r[0]);
  for (const r of dataRows) {
    const code = normSessionCode(r[0]);
    if (!code || /^column|^topics?$/i.test(code)) continue;
    const number = parseInt(code.match(/(\d+)/)?.[1] ?? '0', 10);
    if (!number) continue;
    const topic = (r[1] || '').toString().trim();
    const sessionType: SessionDef['sessionType'] =
      /^basics/i.test(code) ? 'Basics' : number === 14 ? 'Ceremony' : 'Deep Dive';

    if (!sessions.find(s => s.sessionNumber === number)) {
      sessions.push({ sessionNumber: number, sessionCode: code, topic, sessionType });
    }

    // Calendar column layout (mirrored from the live sheet):
    //   col 2 = Batch 1 date          col 3 = Batch 1 trainer
    //   col 4 = Batch 2 date          col 5 = Batch 2 trainer
    //   col 6 = Batch 3 date          col 7 = Batch 3 trainer
    //   col 8 = Batch 4 date          col 9 = Batch 4 trainer
    //   col 8 = Batch 5 date (SHARED) col 10 = Batch 5 trainer
    // Batches 4 & 5 are both in the MP/MAHA zone and share the date column;
    // they only differ in trainer assignment.
    for (let b = 1; b <= 5; b++) {
      const dateCol    = b === 5 ? 8  : 2 + (b - 1) * 2;
      const trainerCol = b === 5 ? 10 : 2 + (b - 1) * 2 + 1;
      const date = parseExcelOrText(r[dateCol] || '');
      const trainer = normTrainer(r[trainerCol] || '');
      if (!date && !trainer) continue;
      const status: BatchSession['status'] =
        date && new Date(date) < new Date() ? 'completed' : 'scheduled';
      batchSessions.push({
        sessionNumber: number,
        batch: b,
        scheduledDate: date,
        trainerName: trainer,
        timeSlot: ZONE_BY_BATCH[b].slot,
        status,
      });
    }
  }
  sessions.sort((a, b) => a.sessionNumber - b.sessionNumber);

  // ── Attendance → employees + attendance
  const employees: Employee[] = [];
  const attendance: AttendanceRow[] = [];
  for (const r of attRows.slice(1)) {
    const batch = parseInt((r[0] || '').toString().trim(), 10);
    if (!batch || batch < 1 || batch > 5) continue;
    const email = (r[4] || '').toString().trim().toLowerCase();
    if (!email) continue;
    const role: Role =
      (['ZM', 'BDM', 'BDA', 'Exit'].includes((r[3] || '').trim()) ? r[3].trim() : 'BDA') as Role;
    const emp: Employee = {
      email,
      name: (r[5] || '').toString().trim(),
      batch: batch as Employee['batch'],
      zone: ZONE_BY_BATCH[batch].zone,
      area: (r[2] || '').toString().trim(),
      role,
      reportingManager: ((r[1] || '').toString().trim() || null),
      isActive: role !== 'Exit',
    };
    employees.push(emp);

    for (let s = 1; s <= 10; s++) {
      const cell = (r[5 + s] || '').toString().trim().toUpperCase();
      if (!cell) {
        attendance.push({ email, sessionNumber: s, batch, status: null });
        continue;
      }
      const status =
        cell === 'YES' ? 'present'
      : cell === 'NO'  ? 'absent'
      : cell === 'R'   ? 'rescheduled'
      : null;
      attendance.push({ email, sessionNumber: s, batch, status: status as AttendanceRow['status'] });
    }
  }

  // ── Assessment (column swap: r[1]=email, r[2]=name)
  const assessments: AssessmentRow[] = [];
  for (const r of asmRows.slice(1)) {
    const sessionNumber = parseInt((r[0] || '').toString().trim(), 10);
    if (!sessionNumber) continue;
    const email = (r[1] || '').toString().trim().toLowerCase();
    if (!email || !email.includes('@')) continue;
    COMPETENCIES.forEach((comp, idx) => {
      const raw = (r[3 + idx] ?? '').toString().trim();
      const score = raw === '' ? null : Number(raw);
      assessments.push({
        email,
        sessionNumber,
        competency: comp,
        score: Number.isFinite(score as number) ? (score as number) : null,
      });
    });
  }

  return { employees, sessions, batchSessions, attendance, assessments };
}
