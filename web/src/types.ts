export type Role = 'ZM' | 'BDM' | 'BDA' | 'Exit';
export type Status = 'present' | 'absent' | 'rescheduled' | 'excused';
export type Band = 'weak' | 'ok' | 'good' | 'great' | 'excellent';
export const BAND_LABEL: Record<Band, string> = {
  weak: 'WEAK', ok: 'OK', good: 'GOOD', great: 'GREAT', excellent: 'EXCELLENT',
};
export const BAND_ORDER: Band[] = ['weak', 'ok', 'good', 'great', 'excellent'];

export interface Employee {
  email: string;          // primary key
  name: string;
  batch: 1 | 2 | 3 | 4 | 5;
  zone: string;
  area: string;
  role: Role;
  reportingManager: string | null;
  isActive: boolean;
}

export interface SessionDef {
  sessionNumber: number;  // 1..14
  sessionCode: string;    // "Basics 1"
  topic: string;
  sessionType: 'Basics' | 'Deep Dive' | 'Ceremony';
}

export interface BatchSession {
  sessionNumber: number;
  batch: number;
  scheduledDate: string | null;   // ISO yyyy-mm-dd
  trainerName: string | null;
  timeSlot: string;
  status: 'scheduled' | 'completed' | 'cancelled' | 'rescheduled';
}

export interface AttendanceRow {
  email: string;
  sessionNumber: number;
  batch: number;
  status: Status | null;          // null = upcoming
}

export interface AssessmentRow {
  email: string;
  sessionNumber: number;
  competency: string;
  score: number | null;           // null = not assessed; 0 = scored zero
}

// How many sessions count toward attendance/completion.
// Source of truth: the Attendance tab has columns Session 1..10.
// The Calendar tab plans 14 sessions, but 11–14 are extensions/ceremonies
// not tracked for attendance. All KPI math uses 10.
export const TOTAL_TRAINING_SESSIONS = 10;

// Every session is delivered across these 5 batches.
export const BATCHES: ReadonlyArray<1 | 2 | 3 | 4 | 5> = [1, 2, 3, 4, 5];

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
] as const;

export const ZONE_BY_BATCH: Record<number, { zone: string; slot: string }> = {
  1: { zone: 'RAJ/GUJARAT',    slot: '10 AM – 12 PM' },
  2: { zone: 'SOUTH',          slot: '10 AM – 12 PM' },
  3: { zone: 'BIHAR/JHAR',     slot: '10 AM – 12 PM' },
  4: { zone: 'MP/MAHA/CHATIS', slot: '1 PM – 3 PM'  },
  5: { zone: 'MP/MAHA/CHATIS', slot: '1 PM – 3 PM'  },
};

// 5-band system (per user spec):
//   WEAK 0-2  → red          (immediate re-assessment)
//   OK   3-4  → amber        (needs work)
//   GOOD 5-6  → lime         (acceptable)
//   GREAT 7-8 → green        (strong)
//   EXCELLENT 9-10 → dark    (mastery)
export function bandOf(score: number | null | undefined): Band | null {
  if (score == null || Number.isNaN(score)) return null;
  if (score <= 2) return 'weak';
  if (score <= 4) return 'ok';
  if (score <= 6) return 'good';
  if (score <= 8) return 'great';
  return 'excellent';
}

export const BAND_COLOR: Record<Band, string> = {
  weak:      '#DC2626',
  ok:        '#F59E0B',
  good:      '#84CC16',
  great:     '#16A34A',
  excellent: '#065F46',
};
