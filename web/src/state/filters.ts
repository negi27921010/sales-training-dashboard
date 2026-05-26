import { useState, useMemo } from 'react';
import { Dataset } from '../lib/derive';

export interface Filters {
  batch: 'all' | 1 | 2 | 3 | 4 | 5;
  reportingManager: string | 'all';
  role: 'all' | 'ZM' | 'BDM' | 'BDA';
}

export const DEFAULT_FILTERS: Filters = {
  batch: 'all',
  reportingManager: 'all',
  role: 'all',
};

export function useFilters(initial: Partial<Filters> = {}) {
  const [filters, setFilters] = useState<Filters>({ ...DEFAULT_FILTERS, ...initial });
  return { filters, setFilters };
}

export function applyFilters(ds: Dataset, f: Filters): Dataset {
  const emails = new Set(
    ds.employees.filter(e =>
      (f.batch === 'all' || e.batch === f.batch)
      && (f.role === 'all' || e.role === f.role)
      && (f.reportingManager === 'all'
        || (e.reportingManager ?? '').toLowerCase() === f.reportingManager.toLowerCase())
    ).map(e => e.email)
  );
  return {
    employees: ds.employees.filter(e => emails.has(e.email)),
    sessions: ds.sessions,
    batchSessions: f.batch === 'all' ? ds.batchSessions : ds.batchSessions.filter(b => b.batch === f.batch),
    attendance: ds.attendance.filter(a => emails.has(a.email)),
    assessments: ds.assessments.filter(a => emails.has(a.email)),
  };
}

export function useFilteredDataset(ds: Dataset | null, f: Filters): Dataset | null {
  return useMemo(() => (ds ? applyFilters(ds, f) : null), [ds, f]);
}
