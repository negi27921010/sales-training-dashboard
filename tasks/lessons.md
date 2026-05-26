# Lessons — Sales Training Dashboard

## 1. Read the sheet structure, not just the data
**Symptom:** Loader silently dropped every Batch 5 row in the Calendar tab → 0/10 sessions "fully complete" on first render.

**Root cause:** I assumed Calendar columns were uniform `[date, trainer]` pairs for all 5 batches. They aren't. Batches 4 & 5 share the MP/MAHA/CHATIS zone and therefore **share the date column (col 8)** — Batch 5 only has its own trainer column (col 10), not its own date column.

**Rule:** When a sheet groups columns by a *zone* or *category* header, never assume the columns repeat uniformly per child entity. Read the header row column-by-column before writing column-index math. A 30-second `node probe.mjs` that prints every `[index] value` pair would have caught this in seconds — write it first when the column layout has any irregularity.

## 2. Dev-mode HMR will lie to you about whether your fix landed
**Symptom:** Edits to `csvSource.ts` showed up in the served JS (verified by curl) but the rendered page kept showing pre-fix numbers across multiple screenshots.

**Root cause:** Vite HMR can serve the updated module while React keeps the stale data already in state — the `useEffect` that calls `loadAll()` only runs once. A "page reload" in headless Chrome is a fresh browser process but Vite's pre-bundle cache may still hold a stale dependency graph.

**Rule:** When verifying a data-loading change, **always re-run `npm run build && npm run preview`** rather than trusting `npm run dev`. The prod build forces a full re-transform and the preview server has no HMR cache. Dev mode is for editing; verification belongs on a clean prod build.

## 3. "Verification" means seeing the new number, not seeing the page render
**Symptom:** I marked Phase 2 "verified" after the first screenshot showed the dashboard rendering, even though the headline KPI (`5 / 14 sessions completed`) silently disagreed with the system prompt's stated truth (`4 of 14`). I rationalized the off-by-one ("maybe today is past 5/26") instead of digging.

**Rule:** Before calling a render "verified," check that the **specific numbers** match the source data hand-computed. If a number is off by even one and there's a plausible-sounding explanation, that's a red flag — verify the explanation by reading the actual data, don't accept it.
