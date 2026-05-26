# Sales Training — Operations Intelligence Dashboard

Real-time training operations dashboard for a 106-person, 5-batch, 10-session sales training program. Tracks attendance, competency assessments, retraining, trainer utilization, and time invested — all sourced from a Google Sheet, synced to Supabase, rendered by a Vite + React + Tailwind frontend.

![Architecture](https://img.shields.io/badge/stack-Vite_+_React_+_Tailwind_+_Supabase-0D9488)

## Quick start (local)

```bash
# 1.  Frontend
cd web
cp .env.example .env.local
# fill VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY  (see "Supabase setup" below)
npm install
npm run dev                # http://127.0.0.1:5173

# 2.  Sync script (one-time + scheduled)
cd ../scripts
cp ../.env.example ../.env
# fill SUPABASE_SERVICE_ROLE_KEY
npm install
npm run check              # dry-run: parse sheet, report counts (no writes)
npm run sync               # writes to Supabase
```

## Architecture

```
Google Sheet  ─[csv export]─►  scripts/sync-to-supabase.mjs  ─[REST]─►  Supabase
                                                                            │
                                                                            ▼
                                                                       React (Vite)
                                                                       on Vercel
```

| Layer       | Tech                          | Why |
|-------------|-------------------------------|-----|
| Source      | Google Sheets (5 tabs)        | Already where trainers update |
| Sync        | Node.js script (or Apps Script)| Same transform, no middleware |
| DB          | Supabase (Postgres)           | REST + Realtime + hosted |
| Frontend    | Vite + React + Tailwind       | Fast, monospace-dense UI |
| Hosting     | Vercel                        | Zero-config deploy |

## Five views

1. **Command Center** — KPIs + Session Progress bar + Sessions table with 3-level drill (Session → Batch/ZM/Zone → individuals) + paginated Attention Required.
2. **Attendance Intelligence** — 4 KPIs, action-driven Retraining Tracker (clubbed by person, smart reassignment suggestions, no-show tracking), and a sortable heatmap with sticky headers.
3. **Assessment & Competency** — Radar + Breakdown side-by-side, score trend, ungraded-session alerts, and Re-Assessment Queue clubbed by person.
4. **People** — typeahead search → full profile (timeline, scorecard, team comparison, action items).
5. **Capacity & Operations** — trainer & salesperson time utilization with editable assumptions, trainer × batch concentration, zone rollup, ZM summary.

## Supabase setup

1. **Apply schema.** Open the Supabase SQL Editor and paste the contents of [`supabase/schema.sql`](supabase/schema.sql). Run once.
2. **Grab the keys** from Supabase → Project Settings → API:
   - `service_role` key  → put into `.env` as `SUPABASE_SERVICE_ROLE_KEY` (server-only)
   - `anon public` key   → put into `web/.env.local` as `VITE_SUPABASE_ANON_KEY`
3. **Run the sync.**
   ```bash
   cd scripts && npm run sync
   ```
   The script handles every quirk in the sheet (assessment column swap, Excel serial dates, trainer name normalization, Batch 4/5 shared date column).
4. **Schedule it.** Cron, GitHub Actions, or Supabase Edge Function — any scheduler that runs `node scripts/sync-to-supabase.mjs` every 5 min.

### Verify

```bash
cd scripts
npm run check     # dry-run: prints sheet sizes + counts the transform would push
```

## Deploy to Vercel

```bash
# from the repo root
vercel               # first time — link the project
vercel --prod        # subsequent deploys
```

In the Vercel project settings → Environment Variables, add:
- `VITE_SUPABASE_URL`         = `https://wuxkcrbarsutnvxzzmly.supabase.co`
- `VITE_SUPABASE_ANON_KEY`    = (anon public key from Supabase)
- `VITE_DATA_SOURCE`          = `supabase`

The included [`vercel.json`](vercel.json) handles SPA rewrites and asset caching.

## Repo layout

```
.
├── README.md
├── vercel.json
├── .env.example                  ← copy to .env (root) for the sync script
├── supabase/
│   └── schema.sql                ← run once in Supabase SQL Editor
├── apps_script/
│   └── sync.gs                   ← alternative sync via Google Apps Script
├── scripts/
│   ├── sync-to-supabase.mjs      ← node-based sync (CLI)
│   ├── check-sync.mjs            ← dry-run/transform inspector
│   └── package.json
└── web/                          ← Vite app
    ├── .env.example
    ├── package.json
    ├── public/
    │   ├── favicon.svg
    │   ├── logo-mark.svg
    │   ├── site.webmanifest
    │   └── seed/*.csv            ← CSV fallback for offline dev
    └── src/
        ├── App.tsx               ← tab + employee state, hash routing
        ├── components/           ← Shell, Tooltip, Atoms (TH/Pager/Sort)
        ├── lib/
        │   ├── csvSource.ts      ← CSV loader (dev mode)
        │   ├── supabaseSource.ts ← Supabase loader (prod mode)
        │   ├── dataSource.ts     ← switches by VITE_DATA_SOURCE
        │   ├── derive.ts         ← KPIs, session status, summaries
        │   ├── sessionDrill.ts   ← per-session drill-down + profiles
        │   ├── intelligence.ts   ← defaulter intel + reassessment intel
        │   ├── actions.ts        ← localStorage-backed action store
        │   └── zm.ts             ← zone-wide ZM inheritance
        ├── state/filters.ts
        ├── styles.css
        ├── types.ts              ← 5-band system, competencies, zones
        └── views/                ← one file per top-level tab
```

## Data quality rules baked in

Every quirk from the source sheet handled the same way in both the Node sync and the in-browser CSV loader:

1. Assessment column swap — `Emp Name` is the email, `Emp Email ID` is the name. Joined by email.
2. Excel serial dates parsed (epoch `1899-12-30`).
3. Trainer name normalization — `"krishna" / "Krishna\n" / "ALOK"` → `Krishna / Alok`.
4. Batches 4 & 5 share the date column (MP/MAHA zone).
5. Blank attendance = "upcoming", not absent.
6. Score `0` is a real score; blank cell = NOT assessed.
7. Cross-batch employees (Arvind Limbe) handled.
8. Role `Exit` flagged inactive — kept in data, excluded from headcount.
9. Zone-wide ZM inheritance — Batch 5 reports to Batch 4's ZM.

## 5-band scoring system

| Band      | Score | Action |
|-----------|-------|--------|
| Weak      | 0–2   | Immediate re-assessment required |
| OK        | 3–4   | Needs work |
| Good      | 5–6   | Acceptable |
| Great     | 7–8   | Strong |
| Excellent | 9–10  | Mastery |

## License

Internal tool. Not for redistribution.
