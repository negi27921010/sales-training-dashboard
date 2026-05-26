#!/usr/bin/env node
/**
 * Read-only check: parses the live sheet and reports what a sync WOULD do —
 * never writes. Useful for verifying the transform end-to-end.
 *
 *   node scripts/check-sync.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
for (const p of [path.join(repoRoot, '.env'), path.join(repoRoot, '.env.local')]) {
  if (!fs.existsSync(p)) continue;
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

const SHEET_ID = process.env.SHEET_ID ?? '1csEE13PjyMUfMlgjeM7oW7Xlfb9DNUAUZ_9J9-wVzzo';

async function fetchSheet(name) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(name)}`;
  const text = await (await fetch(url, { redirect: 'follow' })).text();
  return Papa.parse(text, { skipEmptyLines: true }).data;
}

const COMPETENCIES = [
  'Product Clarity', 'Product Conviction', 'Product Presentation',
  'Objection Handling', 'Offerings Clarity', 'Universe Clarity',
  'School Research', 'Business Strategy', 'Communication Skills',
  'Customer Empathy',
];

function parseDate(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim(); if (!s) return null;
  const n = Number(s);
  if (Number.isFinite(n) && n > 1000) return new Date(Date.UTC(1899,11,30) + n*86400000).toISOString().slice(0,10);
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m1) return `${m1[3]}-${m1[1].padStart(2,'0')}-${m1[2].padStart(2,'0')}`;
  const m2 = s.match(/^(\d{1,2})\s+([A-Za-z]+)$/);
  if (m2) {
    const M = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
    const mm = M[m2[2].toLowerCase().slice(0,3)];
    if (mm) return `${new Date().getFullYear()}-${String(mm).padStart(2,'0')}-${m2[1].padStart(2,'0')}`;
  }
  return null;
}

(async () => {
  const [cal, att, asm] = await Promise.all([
    fetchSheet('Calendar'),
    fetchSheet('Attendance'),
    fetchSheet('Assessment'),
  ]);
  console.log('\n── Sheet tab sizes ─────────────────────────');
  console.log(`Calendar     : ${cal.length-1} rows`);
  console.log(`Attendance   : ${att.length-1} rows`);
  console.log(`Assessment   : ${asm.length-1} rows`);

  // Counts
  let sessionNumbers = new Set();
  let trainerSet = new Set();
  let batchSessionRows = 0;
  for (const r of cal.slice(1)) {
    const code = String(r[0] ?? '').replace(/\s+/g, ' ').trim();
    const n = parseInt(code.match(/(\d+)/)?.[1] ?? '0', 10);
    if (!n) continue;
    sessionNumbers.add(n);
    for (let b = 1; b <= 5; b++) {
      const dateCol    = b === 5 ? 8  : 2 + (b - 1) * 2;
      const trainerCol = b === 5 ? 10 : 2 + (b - 1) * 2 + 1;
      const date = parseDate(r[dateCol]);
      const trainer = r[trainerCol] ? String(r[trainerCol]).trim() : '';
      if (date || trainer) batchSessionRows++;
      if (trainer) trainerSet.add(trainer.toLowerCase().replace(/\s+/g,' ').trim());
    }
  }
  console.log(`\n── Calendar ──`);
  console.log(`Distinct sessions     : ${sessionNumbers.size}`);
  console.log(`Trainer-batch slots   : ${batchSessionRows}`);
  console.log(`Distinct trainers     : ${trainerSet.size}  → ${[...trainerSet].join(', ')}`);

  // Employees
  const employees = [];
  for (const r of att.slice(1)) {
    const batch = parseInt(String(r[0] ?? '').trim(), 10);
    if (!batch) continue;
    const email = String(r[4] ?? '').trim().toLowerCase();
    if (!email) continue;
    employees.push({ email, batch, role: String(r[3] ?? '').trim() });
  }
  const roleCounts = employees.reduce((a, e) => (a[e.role] = (a[e.role]||0)+1, a), {});
  console.log(`\n── Attendance roster ──`);
  console.log(`Employees             : ${employees.length}`);
  console.log(`Role distribution     : ${Object.entries(roleCounts).map(([k,v])=>`${k}=${v}`).join(' · ')}`);

  // Attendance cells
  let yes=0, no=0, blank=0, other=0;
  for (const r of att.slice(1)) {
    for (let s = 1; s <= 10; s++) {
      const cell = String(r[5+s] ?? '').trim().toUpperCase();
      if (!cell) blank++; else if (cell === 'YES') yes++; else if (cell === 'NO') no++; else other++;
    }
  }
  console.log(`\n── Attendance cells (S1-S10) ──`);
  console.log(`YES=${yes} · NO=${no} · blank=${blank} · other=${other}`);
  console.log(`Attendance %          : ${((yes/(yes+no))*100).toFixed(1)}%`);

  // Assessments
  let scored = 0, ungraded = 0, byBand = {weak:0, ok:0, good:0, great:0, excellent:0};
  for (const r of asm.slice(1)) {
    const sn = parseInt(String(r[0] ?? '').trim(), 10);
    if (!sn) continue;
    const email = String(r[1] ?? '').trim().toLowerCase();
    if (!email.includes('@')) continue;
    COMPETENCIES.forEach((_c, idx) => {
      const raw = r[3 + idx];
      if (raw == null || raw === '') { ungraded++; return; }
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || n > 10) { ungraded++; return; }
      scored++;
      const band = n <= 2 ? 'weak' : n <= 4 ? 'ok' : n <= 6 ? 'good' : n <= 8 ? 'great' : 'excellent';
      byBand[band]++;
    });
  }
  console.log(`\n── Assessments ──`);
  console.log(`Scored cells          : ${scored}`);
  console.log(`Blank/invalid cells   : ${ungraded}`);
  console.log(`Band distribution     : ${Object.entries(byBand).map(([k,v])=>`${k}=${v}`).join(' · ')}`);
  console.log('\n✓ Transform OK — counts ready to push to Supabase.\n');
})().catch(e => { console.error(e); process.exit(1); });
