# Sales Training Operations Intelligence Dashboard — Build Plan

## Source of Truth
- Live sheet: https://docs.google.com/spreadsheets/d/1csEE13PjyMUfMlgjeM7oW7Xlfb9DNUAUZ_9J9-wVzzo
- 47 employees rostered (full org = 106), 4 of 14 sessions completed, 5 batches, 6 trainers confirmed.

## Phased Plan (per system prompt §9)

### Phase 1 — Data pipeline (this session)
- [x] Pull live CSVs from all 5 tabs as dev seed data
- [x] Write Supabase schema: 8 tables + 6 views
- [x] Write Google Apps Script sync (handles assessment column-swap, Excel serial dates, trainer name normalization)
- [x] Document setup steps (Supabase project, service-role key, Apps Script properties)

### Phase 2 — Command Center view (this session)
- [x] Scaffold Vite + React 18 + TypeScript + Tailwind
- [x] Theme tokens (mono base, status colors, light/dark toggle)
- [x] Top-bar + tab shell, global filter state
- [x] CSV loader (dev) + Supabase client (prod) — same data shape
- [x] Components: Program Progress Bar, KPI Strip, Batch Status Cards, Attention Required table
- [x] Verify in browser

### Phase 3 — Attendance Intelligence (NEXT)
- [ ] Heatmap (47 × 14, virtualized if needed), trend lines, retraining tracker, RM filter

### Phase 4 — Assessment & Competency
- [ ] Radar (aggregate), competency table, employee grid, re-assessment queue, pre/post

### Phase 5 — People View
- [ ] Typeahead, attendance timeline, scorecard, trend, auto action items, RM comparison

### Phase 6 — Capacity & Operations
- [ ] Trainer utilization, trainer×batch heatmap, RM team summary, zone rollup, capacity math

### Phase 7 — Session Quality (recordings)
- [ ] Whisper or Fireflies pipeline → session_quality table → Command Center + Capacity surfacing

### Phase 8 — Polish
- [ ] Supabase Auth (RM vs Leadership roles), CSV export per view, dark mode, mobile KPI-only view

## Data quality rules being enforced (system prompt §10)
1. Assessment column-swap: `Emp Name` = email, `Emp Email ID` = name → mapped by email
2. Reporting Manager blank → group by Batch as proxy
3. Cross-batch (Arvind Limbe Batch 5 in Batch 4 row 34) → handled in attendance loader
4. Role = Exit (Joheb Khan) → flagged inactive, excluded from utilization, kept in data
5. Partial assessments → "Not Assessed", excluded from averages (not zero)
6. Future sessions blank → "Upcoming", not absent
7. Excel serial dates (e.g. 46161) → parsed with epoch 1899-12-30
8. Trainer name inconsistency ("krishna" / "Krishna" / "Krishna\n") → trim + Title Case
9. Score 0 vs NULL → NULL = not assessed, 0 = assessed-and-zero
10. Batch 2 future schedule NaN → "TBD"

## Review

### Phase 1 + Phase 2 (initial build) — 2026-05-26
Delivered:
- `supabase/schema.sql` — 8 tables (employees, sessions, batch_sessions, attendance, assessments, session_quality, trainers, reporting_managers) + 6 views + seed for 14 sessions + open-read RLS.
- `apps_script/sync.gs` — Google Apps Script for live sheet → Supabase sync, handling all §10 quirks (assessment column-swap, Excel serial dates, trainer name normalization, Batch 5 shared-date-column).
- `web/` — Vite + React 18 + TS + Tailwind project with CSV-or-Supabase loader, global filters (Batch/RM/Role), light/dark theme.
- `web/public/seed/*.csv` — live sheet snapshot for dev (47 employees, 14 sessions, 4 completed).
- Command Center view with: Program Progress bar (10 sessions), KPI strip (4 metrics with info-tooltips), session-centric Session Table (10 rows × per-batch dots), Attention Required Top-10.

### Phase 2 refinements (same day)
- Switched program length from **14 → 10 sessions** (Attendance tab is the source of truth, and only tracks 1–10).
- Switched from batch-first to **session-first** dashboard layout: Batch Cards → Session Table with per-batch status dots.
- "Fully complete" definition: all 5 batches must show `status='completed'` for that session.
- Added **plain-English info tooltips** (custom `<InfoTip>`) on every KPI label and column header explaining the formula and what is/isn't counted.
- **Fix:** Calendar column layout — Batches 4 & 5 share the date column (col 8); Batch 5 only has its own trainer column (col 10). Without this, every Batch 5 row was being dropped, showing 0/10 instead of 4/10 fully complete.

Verified in production preview at http://127.0.0.1:4173/:
- Program Progress shows `4 / 10 fully complete · 1 in progress` ✓
- Basics 1–2 & Deep Dive 3–4 each show 5/5 batch dots ✓
- Deep Dive 5 shows 4/5 (Batch 2 missing — that batch still has no published schedule) ✓
- All trainers (Krishna, Alok, Rolly, Anshika, Chetali, Umesh) appear in the session rows ✓

### Open items for next phase
1. The Reporting Manager column in the sheet is still blank for every employee → "RM" filter dropdown is empty and Attention Required column shows "unassigned" everywhere. Needs the RAL team to populate.
2. Phase 3 (Attendance Intelligence) — heatmap, trend lines, retraining tracker.
