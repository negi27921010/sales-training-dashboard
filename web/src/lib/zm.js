import { ZONE_BY_BATCH } from '../types';
export function buildZmIndex(ds) {
    const byBatch = new Map();
    const byZone = new Map();
    // 1) Anyone explicitly carrying role=ZM in their batch
    for (const e of ds.employees) {
        if (e.role !== 'ZM')
            continue;
        byBatch.set(e.batch, e.name);
        const zone = ZONE_BY_BATCH[e.batch].zone;
        if (!byZone.has(zone))
            byZone.set(zone, e.name);
    }
    // 2) Fill missing batches by inheriting from the zone
    for (let b = 1; b <= 5; b++) {
        if (byBatch.has(b))
            continue;
        const zone = ZONE_BY_BATCH[b].zone;
        const inherited = byZone.get(zone);
        if (inherited)
            byBatch.set(b, inherited);
    }
    // 3) Honor any explicit reportingManager fields if they ever get populated
    for (const e of ds.employees) {
        const rm = e.reportingManager?.trim();
        if (!rm)
            continue;
        const zone = ZONE_BY_BATCH[e.batch].zone;
        if (!byBatch.has(e.batch))
            byBatch.set(e.batch, rm);
        if (!byZone.has(zone))
            byZone.set(zone, rm);
    }
    const list = Array.from(new Set(byBatch.values())).sort();
    return { byBatch, byZone, list };
}
/** Resolve the ZM that an employee answers to. Falls back to a stable
 *  "Unassigned — Batch N" string so downstream grouping never collapses. */
export function zmFor(emp, idx) {
    if (emp.reportingManager?.trim())
        return emp.reportingManager.trim();
    const direct = idx.byBatch.get(emp.batch);
    if (direct)
        return direct;
    return `Unassigned — Batch ${emp.batch}`;
}
