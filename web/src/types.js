export const BAND_LABEL = {
    weak: 'WEAK', ok: 'OK', good: 'GOOD', great: 'GREAT', excellent: 'EXCELLENT',
};
export const BAND_ORDER = ['weak', 'ok', 'good', 'great', 'excellent'];
// How many sessions count toward attendance/completion.
// Source of truth: the Attendance tab has columns Session 1..10.
// The Calendar tab plans 14 sessions, but 11–14 are extensions/ceremonies
// not tracked for attendance. All KPI math uses 10.
export const TOTAL_TRAINING_SESSIONS = 10;
// Every session is delivered across these 5 batches.
export const BATCHES = [1, 2, 3, 4, 5];
export const COMPETENCIES = [
    'Product Clarity',
    'Product Conviction',
    'Product Presentation',
    'Objection Handling',
    'Offerings Clarity',
    'Universe Clarity',
    'School Research',
    'Business Strategy',
    'Communication Skills',
    'Customer Empathy',
];
export const ZONE_BY_BATCH = {
    1: { zone: 'RAJ/GUJARAT', slot: '10 AM – 12 PM' },
    2: { zone: 'SOUTH', slot: '10 AM – 12 PM' },
    3: { zone: 'BIHAR/JHAR', slot: '10 AM – 12 PM' },
    4: { zone: 'MP/MAHA/CHATIS', slot: '1 PM – 3 PM' },
    5: { zone: 'MP/MAHA/CHATIS', slot: '1 PM – 3 PM' },
};
// 5-band system (per user spec):
//   WEAK 0-2  → red          (immediate re-assessment)
//   OK   3-4  → amber        (needs work)
//   GOOD 5-6  → lime         (acceptable)
//   GREAT 7-8 → green        (strong)
//   EXCELLENT 9-10 → dark    (mastery)
export function bandOf(score) {
    if (score == null || Number.isNaN(score))
        return null;
    if (score <= 2)
        return 'weak';
    if (score <= 4)
        return 'ok';
    if (score <= 6)
        return 'good';
    if (score <= 8)
        return 'great';
    return 'excellent';
}
export const BAND_COLOR = {
    weak: '#DC2626',
    ok: '#F59E0B',
    good: '#84CC16',
    great: '#16A34A',
    excellent: '#065F46',
};
