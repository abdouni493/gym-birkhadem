import { supabase } from '@/lib/supabase';

export interface FreeSession {
  id: string;
  athlete_id: string | null;
  passenger_name: string | null;
  price: number;
  session_date: string;
  session_time: string;
  notes: string | null;
  created_at: string;
  athletes?: { full_name: string; photo_url: string | null } | null;
}

export interface FreeSessionInput {
  athlete_id: string | null;
  passenger_name: string | null;
  price: number;
  session_date: string;
  session_time: string;
  notes: string | null;
}

const SELECT = `
  id, athlete_id, passenger_name, price, session_date, session_time, notes, created_at,
  athletes ( full_name, photo_url )
`;

export async function listFreeSessions(limit = 100): Promise<FreeSession[]> {
  const { data, error } = await supabase
    .from('free_sessions')
    .select(SELECT)
    .order('session_date', { ascending: false })
    .order('session_time', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as FreeSession[];
}

export async function createFreeSession(input: FreeSessionInput): Promise<void> {
  // The DB CHECK requires an athlete OR a named walk-in; send exactly one so a
  // stale passenger_name can't ride along with a selected athlete.
  const { error } = await supabase.from('free_sessions').insert({
    athlete_id: input.athlete_id,
    passenger_name: input.athlete_id ? null : (input.passenger_name?.trim() || null),
    price: input.price,
    session_date: input.session_date,
    session_time: input.session_time,
    notes: input.notes?.trim() || null,
  });
  if (error) throw error;
}

export async function deleteFreeSession(id: string): Promise<void> {
  const { error } = await supabase.from('free_sessions').delete().eq('id', id);
  if (error) throw error;
}

/** Display name for a session: the member, or the walk-in, or a fallback. */
export const sessionName = (s: FreeSession): string =>
  s.athletes?.full_name || s.passenger_name || 'Passager';
