import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  throw new Error(
    'Supabase is not configured. Copy .env.example to .env and set ' +
      'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart the dev server.',
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

export const SUPABASE_URL = url;

/**
 * Unwrap a PostgREST response, turning its error into a throw.
 *
 * RLS denials surface as empty results rather than errors on reads, so a caller
 * seeing [] may simply lack permission — that is expected, not a failure.
 */
export function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

/** Human-readable message for a Supabase/Postgres error. */
export function describeError(e: unknown): string {
  if (!e) return 'Unknown error';
  const err = e as { message?: string; code?: string; details?: string };

  // Raised by our RLS policies / guards.
  if (err.code === '42501') return err.message || 'You do not have permission to do that.';
  if (err.code === '23505') return 'That record already exists.';
  if (err.code === '23503') return 'That record is still referenced by something else.';

  return err.message || err.details || String(e);
}
