import { useEffect, useState } from 'react';

/**
 * Local action store. Captures dashboard-side decisions (retraining
 * assignments, re-assessment scheduling, etc.) that don't yet have a backend
 * write-path. Persists to localStorage so they survive reloads.
 *
 * Each action is keyed by a stable id derived from the operation.
 * When Supabase is wired up, swap the read/write of `read()` / `write()` —
 * the rest of the app doesn't need to change.
 */

const KEY = 'sales_training_actions_v1';

export interface RetrainingAction {
  kind: 'retraining';
  id: string;                            // `${email}__S${sessionNumber}`
  email: string;
  sessionNumber: number;
  originalBatch: number;                 // their home batch
  assignedBatch: number;                 // batch they were moved to
  assignedDate: string;                  // ISO date
  status: 'pending' | 'attended' | 'no_show';
  createdAt: string;
  updatedAt: string;
}

export interface ReAssessmentAction {
  kind: 'reassessment';
  id: string;                            // `${email}__${competency}`
  email: string;
  competency: string;
  originalScore: number;
  newScore: number | null;               // null until re-assessment happens
  status: 'pending' | 'scheduled' | 'completed';
  scheduledFor: string | null;
  createdAt: string;
  updatedAt: string;
}

export type Action = RetrainingAction | ReAssessmentAction;

// ─── Storage primitives ────────────────────────────────────────────────────
function read(): Action[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function write(list: Action[]) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new Event('actions:changed'));
}

export function upsertAction(a: Action) {
  const list = read();
  const i = list.findIndex(x => x.kind === a.kind && x.id === a.id);
  if (i >= 0) list[i] = { ...list[i], ...a, updatedAt: new Date().toISOString() };
  else        list.push(a);
  write(list);
}

export function removeAction(kind: Action['kind'], id: string) {
  write(read().filter(x => !(x.kind === kind && x.id === id)));
}

// ─── React hook ────────────────────────────────────────────────────────────
export function useActions(): Action[] {
  const [actions, setActions] = useState<Action[]>(() => read());
  useEffect(() => {
    const refresh = () => setActions(read());
    window.addEventListener('actions:changed', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('actions:changed', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);
  return actions;
}

// ─── Helpers ───────────────────────────────────────────────────────────────
export const retrainingId = (email: string, sessionNumber: number) =>
  `${email.toLowerCase()}__S${sessionNumber}`;

export const reassessmentId = (email: string, competency: string) =>
  `${email.toLowerCase()}__${competency}`;

export function findRetraining(actions: Action[], email: string, sessionNumber: number): RetrainingAction | null {
  return (actions.find(a => a.kind === 'retraining' && a.id === retrainingId(email, sessionNumber)) as RetrainingAction) ?? null;
}

export function findReassessment(actions: Action[], email: string, competency: string): ReAssessmentAction | null {
  return (actions.find(a => a.kind === 'reassessment' && a.id === reassessmentId(email, competency)) as ReAssessmentAction) ?? null;
}
