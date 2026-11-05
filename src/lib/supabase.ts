import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** 設定が無いときは画面で案内する。 */
export const supabaseConfigured = Boolean(url && anonKey);

export const supabase = createClient<Database>(
  url ?? 'http://127.0.0.1:54621',
  anonKey ?? 'missing-anon-key',
);
