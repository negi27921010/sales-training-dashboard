import * as csv from './csvSource';
import * as sb from './supabaseSource';

const mode = (import.meta.env.VITE_DATA_SOURCE ?? 'csv') as 'csv' | 'supabase';

export const dataSource = mode === 'supabase' ? sb : csv;
export const dataSourceMode = mode;
