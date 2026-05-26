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
// ─── Storage primitives ────────────────────────────────────────────────────
function read() {
    if (typeof localStorage === 'undefined')
        return [];
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw)
            return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        return [];
    }
}
function write(list) {
    if (typeof localStorage === 'undefined')
        return;
    localStorage.setItem(KEY, JSON.stringify(list));
    window.dispatchEvent(new Event('actions:changed'));
}
export function upsertAction(a) {
    const list = read();
    const i = list.findIndex(x => x.kind === a.kind && x.id === a.id);
    if (i >= 0)
        list[i] = { ...list[i], ...a, updatedAt: new Date().toISOString() };
    else
        list.push(a);
    write(list);
}
export function removeAction(kind, id) {
    write(read().filter(x => !(x.kind === kind && x.id === id)));
}
// ─── React hook ────────────────────────────────────────────────────────────
export function useActions() {
    const [actions, setActions] = useState(() => read());
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
export const retrainingId = (email, sessionNumber) => `${email.toLowerCase()}__S${sessionNumber}`;
export const reassessmentId = (email, competency) => `${email.toLowerCase()}__${competency}`;
export function findRetraining(actions, email, sessionNumber) {
    return actions.find(a => a.kind === 'retraining' && a.id === retrainingId(email, sessionNumber)) ?? null;
}
export function findReassessment(actions, email, competency) {
    return actions.find(a => a.kind === 'reassessment' && a.id === reassessmentId(email, competency)) ?? null;
}
