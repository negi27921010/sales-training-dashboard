#!/usr/bin/env node
/**
 * Sales Training Dashboard — Google Sheets → Supabase sync.
 *
 * Usage:
 *   node scripts/sync-to-supabase.mjs               # full sync
 *   node scripts/sync-to-supabase.mjs --dry-run     # parse-and-report, no writes
 *
 * Required env (place in `.env`, loaded automatically):
 *   SUPABASE_URL                 = https://<project>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY    = <service role key — server-only secret>
 *   SHEET_ID                     = 1csEE13PjyMUfMlgjeM7oW7Xlfb9DNUAUZ_9J9-wVzzo
 *
 * Honors every quirk in the source sheet:
 *   – Assessment column-swap (Emp Name = email, Emp Email ID = name)
 *   – Excel serial dates (e.g. 46161 → 2026-05-19)
 *   – Trainer name normalization ("krishna" / "Krishna\n" → "Krishna")
 *   – Calendar layout: Batches 4 & 5 share the date column
 *   – Score 0 vs blank distinction (0 is a real score, blank means not assessed)
 *   – Future sessions: blanks ignored (no false-negative absences)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';

// ─── .env loader (no deps) ─────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
loadDotEnv(path.join(repoRoot, '.env'));
loadDotEnv(path.join(repoRoot, '.env.local'));

function loadDotEnv(p) {
  if (!fs.existsSync(p)) return;
  for (const raw of fs.readFileSync(p, 'utf-8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const k = line.slice(0, idx).trim();
    const v = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SHEET_ID     = process.env.SHEET_ID ?? '1csEE13PjyMUfMlgjeM7oW7Xlfb9DNUAUZ_9J9-wVzzo';
const DRY_RUN      = process.argv.includes('--dry-run');

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Set them in .env (see .env.example).');
  process.exit(1);
}

const COMPETENCIES = [
  'Product Clarity', 'Product Conviction', 'Product Presentation',
  'Objection Handling', 'Offerings Clarity', 'Universe Clarity',
  'School Research', 'Business Strategy', 'Communication Skills',
  'Customer Empathy',
];

const ZONE_BY_BATCH = {
  1: { zone: 'RAJ/GUJARAT',    slot: '10 AM - 12 PM' },
  2: { zone: 'SOUTH',          slot: '10 AM - 12 PM' },
  3: { zone: 'BIHAR/JHAR',     slot: '10 AM - 12 PM' },
  4: { zone: 'MP/MAHA/CHATIS', slot: '1 PM - 3 PM'  },
  5: { zone: 'MP/MAHA/CHATIS', slot: '1 PM - 3 PM'  },
};

// ─── Logging helpers ───────────────────────────────────────────────────────
const log = (msg, ...a) => console.log(`[sync] ${msg}`, ...a);
const ok  = (msg)      => console.log(`\x1b[32m[ok]\x1b[0m   ${msg}`);
const warn= (msg)      => console.log(`\x1b[33m[warn]\x1b[0m ${msg}`);
const err = (msg)      => console.error(`\x1b[31m[err]\x1b[0m  ${msg}`);

// ─── Google Sheets fetch (gviz CSV) ────────────────────────────────────────
async function fetchSheet(name) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(name)}`;
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Sheet "${name}" fetch failed: ${res.status}`);
  const text = await res.text();
  return Papa.parse(text, { skipEmptyLines: true }).data;
}

// ─── Transform helpers ─────────────────────────────────────────────────────
function parseDate(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  if (Number.isFinite(n) && n > 1000) {
    return new Date(Date.UTC(1899, 11, 30) + n * 86400000).toISOString().slice(0, 10);
  }
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
  m = s.match(/^(\d{1,2})\s+([A-Za-z]+)$/);
  if (m) {
    const months = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
    const mm = months[m[2].toLowerCase().slice(0,3)];
    if (mm) return `${new Date().getFullYear()}-${String(mm).padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  }
  return null;
}

function normTrainer(v) {
  if (!v) return null;
  const s = String(v).replace(/\s+/g, ' ').trim();
  if (!s) return null;
  return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function parseScore(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 10 ? n : null;
}

// ─── Transformers ──────────────────────────────────────────────────────────
function buildSessions(calRows) {
  const sessions = [];
  const seen = new Set();
  for (const r of calRows.slice(1)) {
    const code = String(r[0] ?? '').replace(/\s+/g, ' ').trim();
    if (!code || /^column|^topics?$/i.test(code)) continue;
    const number = parseInt(code.match(/(\d+)/)?.[1] ?? '0', 10);
    if (!number || seen.has(number)) continue;
    seen.add(number);
    const topic = String(r[1] ?? '').trim();
    const type = /^basics/i.test(code) ? 'Basics' : number === 14 ? 'Ceremony' : 'Deep Dive';
    sessions.push({ session_code: code, topic, session_number: number, session_type: type });
  }
  return sessions;
}

function buildBatchSessions(calRows, sessionMap) {
  const out = [];
  const today = new Date().toISOString().slice(0, 10);
  for (const r of calRows.slice(1)) {
    const code = String(r[0] ?? '').replace(/\s+/g, ' ').trim();
    const number = parseInt(code.match(/(\d+)/)?.[1] ?? '0', 10);
    if (!number) continue;
    const session_id = sessionMap.get(number);
    if (!session_id) continue;
    for (let b = 1; b <= 5; b++) {
      const dateCol    = b === 5 ? 8  : 2 + (b - 1) * 2;
      const trainerCol = b === 5 ? 10 : 2 + (b - 1) * 2 + 1;
      const date    = parseDate(r[dateCol]);
      const trainer = normTrainer(r[trainerCol]);
      if (!date && !trainer) continue;
      const status = date && date <= today ? 'completed' : 'scheduled';
      out.push({
        session_id, batch: b, scheduled_date: date, trainer_name: trainer,
        time_slot: ZONE_BY_BATCH[b].slot, status,
      });
    }
  }
  return out;
}

function buildEmployees(attRows) {
  const out = [];
  const seen = new Set();
  for (const r of attRows.slice(1)) {
    const batch = parseInt(String(r[0] ?? '').trim(), 10);
    if (!batch || batch < 1 || batch > 5) continue;
    const email = String(r[4] ?? '').trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    const role = ['ZM','BDM','BDA','Exit'].includes(String(r[3] ?? '').trim()) ? String(r[3]).trim() : 'BDA';
    out.push({
      email,
      name: String(r[5] ?? '').trim(),
      batch,
      zone: ZONE_BY_BATCH[batch].zone,
      area: String(r[2] ?? '').trim(),
      role,
      reporting_manager: String(r[1] ?? '').trim() || null,
      is_active: role !== 'Exit',
    });
  }
  return out;
}

function buildAttendance(attRows, empMap, sessionMap) {
  const out = [];
  for (const r of attRows.slice(1)) {
    const batch = parseInt(String(r[0] ?? '').trim(), 10);
    if (!batch || batch < 1 || batch > 5) continue;
    const email = String(r[4] ?? '').trim().toLowerCase();
    const employee_id = empMap.get(email);
    if (!employee_id) continue;
    for (let s = 1; s <= 10; s++) {
      const cell = String(r[5 + s] ?? '').trim().toUpperCase();
      if (!cell) continue; // blank = upcoming
      const status = cell === 'YES' ? 'present'
                   : cell === 'NO'  ? 'absent'
                   : cell === 'R'   ? 'rescheduled' : null;
      if (!status) continue;
      const session_id = sessionMap.get(s);
      if (!session_id) continue;
      out.push({ employee_id, session_id, batch, status });
    }
  }
  return out;
}

function buildAssessments(asmRows, empMap, sessionMap) {
  const out = [];
  for (const r of asmRows.slice(1)) {
    const sessionNum = parseInt(String(r[0] ?? '').trim(), 10);
    if (!sessionNum) continue;
    const email = String(r[1] ?? '').trim().toLowerCase();   // column-swap: r[1] = email
    if (!email || !email.includes('@')) continue;
    const employee_id = empMap.get(email);
    const session_id  = sessionMap.get(sessionNum);
    if (!employee_id || !session_id) continue;
    COMPETENCIES.forEach((comp, idx) => {
      const score = parseScore(r[3 + idx]);
      if (score == null) return;                              // skip "not assessed" rows
      out.push({ employee_id, session_id, competency: comp, score, is_reassessment: false });
    });
  }
  return out;
}

// ─── Supabase REST primitives ──────────────────────────────────────────────
async function sbRequest(method, path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : [];
}

async function upsert(table, rows, onConflict) {
  if (rows.length === 0) return [];
  if (DRY_RUN) { log(`(dry-run) would upsert ${rows.length} rows → ${table}`); return []; }
  const all = [];
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const result = await sbRequest('POST', `${table}?on_conflict=${encodeURIComponent(onConflict)}`, chunk);
    all.push(...result);
  }
  return all;
}

async function fetchIdMap(table, key, idCol = 'id') {
  const rows = await sbRequest('GET', `${table}?select=${idCol},${key}&limit=10000`);
  const map = new Map();
  for (const r of rows) map.set(r[key], r[idCol]);
  return map;
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
  log(`Supabase URL: ${SUPABASE_URL}`);
  log(`Sheet ID:     ${SHEET_ID}`);
  log(`Mode:         ${DRY_RUN ? 'DRY RUN' : 'WRITE'}`);

  log('Fetching sheets…');
  const [calRows, attRows, asmRows] = await Promise.all([
    fetchSheet('Calendar'),
    fetchSheet('Attendance'),
    fetchSheet('Assessment'),
  ]);
  ok(`Calendar=${calRows.length-1} rows · Attendance=${attRows.length-1} rows · Assessment=${asmRows.length-1} rows`);

  // 1) Sessions
  const sessions = buildSessions(calRows);
  log(`Upserting ${sessions.length} sessions…`);
  await upsert('sessions', sessions, 'session_code');
  const sessionMap = DRY_RUN
    ? new Map(sessions.map(s => [s.session_number, -s.session_number]))
    : await fetchIdMap('sessions', 'session_number');
  ok(`Sessions: ${sessionMap.size} ids known`);

  // 2) Batch sessions
  const batchSessions = buildBatchSessions(calRows, sessionMap);
  log(`Upserting ${batchSessions.length} batch_sessions…`);
  await upsert('batch_sessions', batchSessions, 'session_id,batch');
  ok(`Batch sessions upserted`);

  // 3) Employees
  const employees = buildEmployees(attRows);
  log(`Upserting ${employees.length} employees…`);
  await upsert('employees', employees, 'email');
  const empMap = DRY_RUN
    ? new Map(employees.map(e => [e.email, e.email]))
    : await fetchIdMap('employees', 'email');
  ok(`Employees: ${empMap.size} ids known`);

  // 4) Attendance
  const attendance = buildAttendance(attRows, empMap, sessionMap);
  log(`Upserting ${attendance.length} attendance rows…`);
  await upsert('attendance', attendance, 'employee_id,session_id');
  ok(`Attendance upserted`);

  // 5) Assessments
  const assessments = buildAssessments(asmRows, empMap, sessionMap);
  log(`Upserting ${assessments.length} assessment rows…`);
  await upsert('assessments', assessments, 'employee_id,session_id,competency,is_reassessment');
  ok(`Assessments upserted`);

  // ─── Verification probes ────────────────────────────────────────────────
  if (!DRY_RUN) {
    log('Verifying…');
    const empCount  = (await sbRequest('GET', 'employees?select=email&limit=10000')).length;
    const attCount  = (await sbRequest('GET', 'attendance?select=id&limit=20000')).length;
    const asmCount  = (await sbRequest('GET', 'assessments?select=id&limit=20000')).length;
    const bsCount   = (await sbRequest('GET', 'batch_sessions?select=id&limit=10000')).length;

    if (empCount !== employees.length)
      warn(`Employee count mismatch — sheet=${employees.length} db=${empCount}`);
    if (attCount !== attendance.length)
      warn(`Attendance mismatch — built=${attendance.length} db=${attCount}`);
    if (asmCount !== assessments.length)
      warn(`Assessment mismatch — built=${assessments.length} db=${asmCount}`);
    if (bsCount !== batchSessions.length)
      warn(`batch_session mismatch — built=${batchSessions.length} db=${bsCount}`);

    ok(`DB now has: employees=${empCount} · attendance=${attCount} · assessments=${asmCount} · batch_sessions=${bsCount}`);
  }

  ok('Done.');
}

main().catch(e => { err(e.stack || e.message); process.exit(1); });
