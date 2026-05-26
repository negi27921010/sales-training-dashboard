import { Employee, ZONE_BY_BATCH } from '../types';
import { Dataset } from './derive';

/**
 * The org's "Reporting Manager" is operationally the Zonal Manager.
 * In data: each batch should contain a role=ZM employee. In practice:
 *
 *   - Most batches have one (Batch 1=Manmeet, B2=Dinesh, B3=Irfan, B4=Don Bosco)
 *   - Batch 5 has no ZM-role employee but is in the same zone (MP/MAHA/CHATIS)
 *     as Batch 4, so its members report to the same ZM (Don Bosco).
 *
 * This helper makes the inheritance explicit and applies uniformly across
 * tables, filters, and group labels.
 */

export interface ZmIndex {
  byBatch: Map<number, string>;   // batch -> ZM name
  byZone:  Map<string, string>;   // zone  -> ZM name
  /** All known ZM names in this dataset (sorted, deduped). */
  list: string[];
}

export function buildZmIndex(ds: Dataset): ZmIndex {
  const byBatch = new Map<number, string>();
  const byZone  = new Map<string, string>();

  // 1) Anyone explicitly carrying role=ZM in their batch
  for (const e of ds.employees) {
    if (e.role !== 'ZM') continue;
    byBatch.set(e.batch, e.name);
    const zone = ZONE_BY_BATCH[e.batch].zone;
    if (!byZone.has(zone)) byZone.set(zone, e.name);
  }

  // 2) Fill missing batches by inheriting from the zone
  for (let b = 1; b <= 5; b++) {
    if (byBatch.has(b)) continue;
    const zone = ZONE_BY_BATCH[b].zone;
    const inherited = byZone.get(zone);
    if (inherited) byBatch.set(b, inherited);
  }

  // 3) Honor any explicit reportingManager fields if they ever get populated
  for (const e of ds.employees) {
    const rm = e.reportingManager?.trim();
    if (!rm) continue;
    const zone = ZONE_BY_BATCH[e.batch].zone;
    if (!byBatch.has(e.batch)) byBatch.set(e.batch, rm);
    if (!byZone.has(zone))     byZone.set(zone, rm);
  }

  const list = Array.from(new Set(byBatch.values())).sort();
  return { byBatch, byZone, list };
}

/** Resolve the ZM that an employee answers to. Falls back to a stable
 *  "Unassigned — Batch N" string so downstream grouping never collapses. */
export function zmFor(emp: Employee, idx: ZmIndex): string {
  if (emp.reportingManager?.trim()) return emp.reportingManager.trim();
  const direct = idx.byBatch.get(emp.batch);
  if (direct) return direct;
  return `Unassigned — Batch ${emp.batch}`;
}
