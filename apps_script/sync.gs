/**
 * Sales Training Dashboard — Google Sheets → Supabase sync
 * Deploy inside the source spreadsheet's bound Apps Script project.
 *
 *   1.  Extensions → Apps Script
 *   2.  Paste this file. Project Settings → Script properties:
 *         SUPABASE_URL              = https://YOUR-PROJECT.supabase.co
 *         SUPABASE_SERVICE_ROLE_KEY = <service role key — keep secret>
 *   3.  Triggers:
 *         onEditTrigger      — From spreadsheet → On edit          (live)
 *         scheduledFullSync  — Time-driven → Every 5 minutes       (backup)
 *
 *  Handles every quirk called out in system prompt §10:
 *    – Assessment column-swap (Emp Name = email, Emp Email ID = name)
 *    – Excel serial dates (e.g. 46161 → 2026-05-19)
 *    – Trainer name normalization
 *    – Blank attendance = "Upcoming" (NULL), not absent
 *    – Score 0 vs NULL distinction
 *    – Cross-batch employees (Arvind Limbe — Batch 5 in Batch 4 row)
 *    – Batch 2 TBD future schedule
 */

// ─── Config ──────────────────────────────────────────────────────────────────
const TABS = {
  CALENDAR:    'Calendar',
  ATTENDANCE:  'Attendance',
  ASSESSMENT:  'Assessment',
  PARAMETERS:  'Assessment Parameters',
  RECORDINGS:  'Session Recordings',
};

const ZONE_BY_BATCH = {
  1: { zone: 'RAJ/GUJARAT',     slot: '10 AM - 12 PM' },
  2: { zone: 'SOUTH',           slot: '10 AM - 12 PM' },
  3: { zone: 'BIHAR/JHAR',      slot: '10 AM - 12 PM' },
  4: { zone: 'MP/MAHA/CHATIS',  slot: '1 PM - 3 PM'  },
  5: { zone: 'MP/MAHA/CHATIS',  slot: '1 PM - 3 PM'  },
};

const COMPETENCIES = [
  'Product Clarity', 'Product Conviction', 'Product Presentation',
  'Objection Handling', 'Offerings Clarity', 'Universe Clarity',
  'School Research', 'Business Strategy', 'Communication Skills',
  'Customer Empathy',
];

// ─── Entry points ────────────────────────────────────────────────────────────
function onEditTrigger(e) {
  const sheetName = e && e.range ? e.range.getSheet().getName() : null;
  if (!sheetName) return scheduledFullSync();
  if (sheetName === TABS.ATTENDANCE) syncAttendance();
  else if (sheetName === TABS.ASSESSMENT) syncAssessments();
  else if (sheetName === TABS.CALENDAR) syncCalendar();
}

function scheduledFullSync() {
  syncCalendar();
  syncAttendance();
  syncAssessments();
}

// ─── Calendar → sessions + batch_sessions ────────────────────────────────────
function syncCalendar() {
  const rows = readSheet_(TABS.CALENDAR);
  if (!rows.length) return;

  // The Calendar tab has paired columns: [date, trainer] per batch.
  // Header row 0 contains: Column 1 | TOPICS | RAJ/GUJARAT | BATCH 1 | SOUTH | BATCH 2 | …
  // After dropping the first 2 cols (session_code, topic) the remaining pairs map
  // to batches 1..5 in order.
  const records = [];
  for (const r of rows) {
    const code  = normTrainer_(r[0]);
    const topic = (r[1] || '').toString().trim();
    if (!code || /^column|^topics?$/i.test(code)) continue;

    // Column layout: Batches 4 & 5 share the date column (col 8); they only
    // differ in trainer assignment (col 9 vs col 10).
    [1,2,3,4,5].forEach(b => {
      const dateCol    = b === 5 ? 8  : 2 + (b - 1) * 2;
      const trainerCol = b === 5 ? 10 : 2 + (b - 1) * 2 + 1;
      const dateCell    = r[dateCol];
      const trainerCell = r[trainerCol];
      const date = parseSheetDate_(dateCell);
      const trainer = normTrainer_(trainerCell);
      if (!date && !trainer) return;
      const meta = ZONE_BY_BATCH[b];
      records.push({
        session_code:   normSessionCode_(code),
        topic,
        batch:          b,
        scheduled_date: date,
        trainer_name:   trainer || null,
        time_slot:      meta.slot,
        status:         date && new Date(date) < new Date() ? 'completed' : 'scheduled',
      });
    });
  }

  // 1) Ensure session rows exist (id is serial → use upsert by session_code).
  const sessions = uniqueBy_(records.map(r => ({
    session_code: r.session_code,
    topic:        r.topic,
    session_number: parseInt(r.session_code.match(/(\d+)/)[1], 10),
    session_type:   r.session_code.toLowerCase().startsWith('basics') ? 'Basics'
                  : /14$/.test(r.session_code) ? 'Ceremony' : 'Deep Dive',
  })), 'session_code');

  supabaseUpsert_('sessions', sessions, 'session_code');

  // 2) Look up generated session ids to attach to batch_sessions.
  const sessionMap = fetchIdMap_('sessions', 'session_code', 'id');

  const batchRows = records.map(r => ({
    session_id:     sessionMap[r.session_code],
    batch:          r.batch,
    scheduled_date: r.scheduled_date,
    trainer_name:   r.trainer_name,
    time_slot:      r.time_slot,
    status:         r.status,
  })).filter(r => r.session_id);

  supabaseUpsert_('batch_sessions', batchRows, 'session_id,batch');
}

// ─── Attendance → employees + attendance ─────────────────────────────────────
function syncAttendance() {
  const rows = readSheet_(TABS.ATTENDANCE);
  if (!rows.length) return;

  // Headers: Batch | Reporting Manger | Area | Role | Mail ID | Name | Session 1 .. Session 10
  const employees = [];
  const attendance = [];

  for (const r of rows) {
    const batchStr = (r[0] || '').toString().trim();
    if (!batchStr || /^batch$/i.test(batchStr)) continue;
    const batch = parseInt(batchStr, 10);
    if (!batch || batch < 1 || batch > 5) continue;

    const rm    = (r[1] || '').toString().trim() || null;
    const area  = (r[2] || '').toString().trim();
    const role  = (r[3] || '').toString().trim();
    const email = (r[4] || '').toString().trim().toLowerCase();
    const name  = (r[5] || '').toString().trim();
    if (!email) continue;

    const zone = ZONE_BY_BATCH[batch].zone;
    employees.push({
      email, name, batch, zone, area,
      role: ['ZM','BDM','BDA','Exit'].includes(role) ? role : 'BDA',
      reporting_manager: rm,
      is_active: role !== 'Exit',
    });

    // Sessions 1..10 columns are 6..15
    for (let s = 1; s <= 10; s++) {
      const cell = (r[5 + s] || '').toString().trim().toUpperCase();
      if (!cell) continue;                            // blank = upcoming
      const status = cell === 'YES' ? 'present'
                   : cell === 'NO'  ? 'absent'
                   : cell === 'R'   ? 'rescheduled' : null;
      if (!status) continue;
      attendance.push({
        email,
        session_number: s,
        batch,
        status,
      });
    }
  }

  // Upsert employees by email
  supabaseUpsert_('employees', employees, 'email');

  // Map email → uuid, session_number → id
  const empMap     = fetchIdMap_('employees', 'email', 'id');
  const sessionMap = fetchIdMap_('sessions', 'session_number', 'id');

  const attRows = attendance.map(a => ({
    employee_id: empMap[a.email],
    session_id:  sessionMap[a.session_number],
    batch:       a.batch,
    status:      a.status,
  })).filter(a => a.employee_id && a.session_id);

  supabaseUpsert_('attendance', attRows, 'employee_id,session_id');
}

// ─── Assessment → assessments  (handles column-swap) ─────────────────────────
function syncAssessments() {
  const rows = readSheet_(TABS.ASSESSMENT);
  if (!rows.length) return;

  // Headers: Session | Emp Name | Emp Email ID | Product Clarity | … | Customer Empathy
  // Per system prompt §2.2 + §10.1: Emp Name CONTAINS email, Emp Email ID CONTAINS name.
  const records = [];
  for (const r of rows) {
    const sessionNum = parseInt((r[0] || '').toString().trim(), 10);
    if (!sessionNum) continue;
    const email = (r[1] || '').toString().trim().toLowerCase();   // swapped on purpose
    if (!email || email.indexOf('@') === -1) continue;

    COMPETENCIES.forEach((comp, idx) => {
      const raw = r[3 + idx];
      const score = parseScore_(raw);
      records.push({
        email,
        session_number: sessionNum,
        competency: comp,
        score,                                       // null = not assessed, 0 = scored zero
      });
    });
  }

  const empMap     = fetchIdMap_('employees', 'email', 'id');
  const sessionMap = fetchIdMap_('sessions', 'session_number', 'id');

  const rowsOut = records.map(r => ({
    employee_id: empMap[r.email],
    session_id:  sessionMap[r.session_number],
    competency:  r.competency,
    score:       r.score,
    is_reassessment: false,
  })).filter(r => r.employee_id && r.session_id);

  supabaseUpsert_('assessments', rowsOut, 'employee_id,session_id,competency,is_reassessment');
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function readSheet_(name) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  // Drop header row(s). Calendar has 1 header row with merged sub-titles; attendance/assessment 1 each.
  return values.slice(1);
}

function parseSheetDate_(v) {
  if (v === '' || v === null || v === undefined) return null;
  if (v instanceof Date) return Utilities.formatDate(v, 'UTC', 'yyyy-MM-dd');
  if (typeof v === 'number' && v > 1000) {
    // Excel serial → JS Date. Excel epoch 1899-12-30.
    const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
    return Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd');
  }
  const s = v.toString().trim();
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    const [m, d, y] = s.split('/').map(Number);
    return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }
  // "19 May" without year → assume current training year
  const m = s.match(/^(\d{1,2})\s+([A-Za-z]+)$/);
  if (m) {
    const months = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
    const mm = months[m[2].toLowerCase().slice(0,3)];
    if (mm) {
      const y = new Date().getFullYear();
      return `${y}-${String(mm).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
    }
  }
  return null;
}

function normTrainer_(v) {
  if (!v) return '';
  return v.toString().replace(/\s+/g, ' ').trim()
          .toLowerCase()
          .replace(/\b\w/g, c => c.toUpperCase());
}

function normSessionCode_(v) {
  if (!v) return '';
  return v.toString().replace(/\s+/g, ' ').trim();
}

function parseScore_(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  if (Number.isFinite(n) && n >= 0 && n <= 10) return n;
  return null;
}

function uniqueBy_(arr, key) {
  const seen = new Set();
  return arr.filter(x => {
    const k = x[key];
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ─── Supabase REST ───────────────────────────────────────────────────────────
function supabaseConf_() {
  const p = PropertiesService.getScriptProperties();
  const url = p.getProperty('SUPABASE_URL');
  const key = p.getProperty('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Script Properties');
  return { url, key };
}

function supabaseUpsert_(table, rows, onConflict) {
  if (!rows.length) return;
  const { url, key } = supabaseConf_();
  // Chunk in 500-row batches.
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const res = UrlFetchApp.fetch(
      `${url}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`,
      {
        method: 'post',
        contentType: 'application/json',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        payload: JSON.stringify(chunk),
        muteHttpExceptions: true,
      });
    if (res.getResponseCode() >= 300) {
      throw new Error(`Upsert ${table} failed: ${res.getResponseCode()} ${res.getContentText()}`);
    }
  }
}

function fetchIdMap_(table, keyCol, idCol) {
  const { url, key } = supabaseConf_();
  const res = UrlFetchApp.fetch(
    `${url}/rest/v1/${table}?select=${idCol},${keyCol}&limit=10000`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` }, muteHttpExceptions: true });
  if (res.getResponseCode() >= 300) {
    throw new Error(`Fetch ${table} failed: ${res.getContentText()}`);
  }
  const out = {};
  JSON.parse(res.getContentText()).forEach(r => { out[r[keyCol]] = r[idCol]; });
  return out;
}
