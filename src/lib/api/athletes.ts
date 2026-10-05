import { supabase } from '@/lib/supabase';

export interface Sport {
  id: string;
  name: string;
}

export interface Athlete {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  gender: string | null;
  address: string | null;
  sport_id: string | null;
  subscription_status: string | null;
  subscription_expiry: string | null;
  last_payment: string | null;
  total_paid: number;
  account_balance: number;
  rfid_uid: string | null;
  photo_url: string | null;
  created_at: string;
  sports?: Sport | null;
}

export interface AthleteInput {
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  address?: string | null;
  sport_id?: string | null;
  rfid_uid?: string | null;
  photo_url?: string | null;
}

export interface Subscription {
  id: string;
  name: string;
  duration: number;
  sessions: number | null;
  price: number;
  is_open: boolean;
}

export interface AthleteSubscription {
  id: string;
  athlete_id: string;
  subscription_id: string | null;
  name: string;
  price: number;
  payment_date: string;
  expiry_date: string | null;
  amount_paid: number;
  remaining: number;
}

const ATHLETE_SELECT = `
  id, first_name, last_name, full_name, email, phone, date_of_birth, gender,
  address, sport_id, subscription_status, subscription_expiry, last_payment,
  total_paid, account_balance, rfid_uid, photo_url, created_at,
  sports ( id, name )
`;

const clean = (input: AthleteInput) => ({
  ...input,
  email: input.email?.trim().toLowerCase() || null,
  phone: input.phone?.trim() || null,
  date_of_birth: input.date_of_birth || null,
  address: input.address?.trim() || null,
  rfid_uid: input.rfid_uid?.trim().toUpperCase() || null,
});

// ---------------------------------------------------------------------------
// Athletes
// ---------------------------------------------------------------------------

export async function listAthletes(): Promise<Athlete[]> {
  const { data, error } = await supabase
    .from('athletes')
    .select(ATHLETE_SELECT)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Athlete[];
}

export async function getAthlete(id: string): Promise<Athlete | null> {
  const { data, error } = await supabase.from('athletes').select(ATHLETE_SELECT).eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as unknown as Athlete) ?? null;
}

export async function createAthlete(input: AthleteInput): Promise<Athlete> {
  const { data, error } = await supabase.from('athletes').insert(clean(input)).select(ATHLETE_SELECT).single();
  if (error) throw error;
  return data as unknown as Athlete;
}

export async function updateAthlete(id: string, input: AthleteInput): Promise<Athlete> {
  const { data, error } = await supabase.from('athletes').update(clean(input)).eq('id', id).select(ATHLETE_SELECT).single();
  if (error) throw error;
  return data as unknown as Athlete;
}

export async function deleteAthlete(id: string): Promise<void> {
  const { error } = await supabase.from('athletes').delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Sports
// ---------------------------------------------------------------------------

export async function listSports(): Promise<Sport[]> {
  const { data, error } = await supabase.from('sports').select('*').order('name');
  if (error) throw error;
  return (data ?? []) as Sport[];
}

export async function createSport(name: string): Promise<Sport> {
  const { data, error } = await supabase.from('sports').insert({ name: name.trim() }).select().single();
  if (error) throw error;
  return data as Sport;
}

/**
 * Delete a sport. The athletes.sport_id FK is ON DELETE SET NULL, so any
 * athlete still pointing at this sport simply loses the reference — no rows
 * are removed with it.
 */
export async function deleteSport(id: string): Promise<void> {
  const { error } = await supabase.from('sports').delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Subscription catalog
// ---------------------------------------------------------------------------

export async function listSubscriptionTypes(): Promise<Subscription[]> {
  const { data, error } = await supabase.from('subscriptions').select('*').order('name');
  if (error) throw error;
  return (data ?? []) as Subscription[];
}

export interface SubscriptionInput {
  name: string;
  duration: number;
  sessions: number | null;
  price: number;
  is_open: boolean;
}

export async function createSubscriptionType(input: SubscriptionInput): Promise<void> {
  const { error } = await supabase.from('subscriptions').insert(input);
  if (error) throw error;
}

export async function updateSubscriptionType(id: string, input: SubscriptionInput): Promise<void> {
  const { error } = await supabase.from('subscriptions').update(input).eq('id', id);
  if (error) throw error;
}

export async function deleteSubscriptionType(id: string): Promise<void> {
  const { error } = await supabase.from('subscriptions').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Active-member count and gross revenue per subscription type.
 *
 * "active" = an athlete_subscriptions row whose expiry is null (open) or in the
 * future. Counted client-side from a single fetch to avoid N per-type queries.
 */
export async function subscriptionUsage(): Promise<Record<string, { members: number; revenue: number }>> {
  const { data, error } = await supabase
    .from('athlete_subscriptions')
    .select('subscription_id, amount_paid, expiry_date');
  if (error) throw error;

  const todayIso = new Date().toISOString().split('T')[0];
  const out: Record<string, { members: number; revenue: number }> = {};
  for (const row of (data ?? []) as { subscription_id: string | null; amount_paid: number; expiry_date: string | null }[]) {
    if (!row.subscription_id) continue;
    const active = !row.expiry_date || row.expiry_date >= todayIso;
    const cur = out[row.subscription_id] ?? { members: 0, revenue: 0 };
    if (active) cur.members += 1;
    cur.revenue += Number(row.amount_paid || 0);
    out[row.subscription_id] = cur;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Athlete subscriptions + payments
// ---------------------------------------------------------------------------

export async function listAthleteSubscriptions(athleteId: string): Promise<AthleteSubscription[]> {
  const { data, error } = await supabase
    .from('athlete_subscriptions')
    .select('*')
    .eq('athlete_id', athleteId)
    .order('payment_date', { ascending: false });
  if (error) throw error;
  return (data ?? []) as AthleteSubscription[];
}

const addDays = (iso: string, days: number): string => {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
};

export interface AssignSubscriptionInput {
  athleteId: string;
  subscription: Subscription;
  paymentDate: string;
  amountPaid: number;
  /** Credit to apply toward the amount paid. */
  creditUsed?: number;
  currentBalance: number;
  currentTotalPaid: number;
}

/**
 * Assign a subscription to an athlete and settle its initial payment.
 *
 * Mirrors the legacy flow: optionally spends account credit, records the credit
 * usage, then refreshes the athlete's status/expiry/balance. PostgREST has no
 * multi-statement transaction, so on failure after the subscription insert the
 * row is rolled back by hand to avoid a half-applied assignment.
 */
export async function assignSubscription(input: AssignSubscriptionInput): Promise<void> {
  const { subscription: sub, paymentDate } = input;
  const expiry = sub.duration > 0 ? addDays(paymentDate, sub.duration) : null;
  const creditUsed = Math.max(0, input.creditUsed ?? 0);
  const amountPaid = Math.max(0, input.amountPaid);

  const { data: subRow, error } = await supabase
    .from('athlete_subscriptions')
    .insert({
      athlete_id: input.athleteId,
      subscription_id: sub.id,
      name: sub.name,
      price: sub.price,
      payment_date: paymentDate,
      expiry_date: expiry,
      amount_paid: amountPaid,
    })
    .select('id')
    .single();
  if (error) throw error;
  const subId = (subRow as { id: string }).id;

  try {
    if (creditUsed > 0) {
      const { error: cErr } = await supabase.from('athlete_credits').insert({
        athlete_id: input.athleteId,
        amount: creditUsed,
        credit_date: paymentDate,
        description: `Payment for ${sub.name}`,
        type: 'used',
      });
      if (cErr) throw cErr;
    }

    const newBalance = Math.max(0, input.currentBalance - creditUsed);
    const isActive = expiry ? new Date(expiry) > new Date() : true;

    const { error: aErr } = await supabase
      .from('athletes')
      .update({
        total_paid: input.currentTotalPaid + amountPaid,
        subscription_expiry: expiry,
        subscription_status: isActive ? 'active' : 'expired',
        last_payment: paymentDate,
        account_balance: newBalance,
      })
      .eq('id', input.athleteId);
    if (aErr) throw aErr;
  } catch (e) {
    await supabase.from('athlete_subscriptions').delete().eq('id', subId);
    throw e;
  }
}

/** Record a payment against an existing (partially paid) subscription. */
export async function paySubscription(input: {
  subscriptionId: string;
  athleteId: string;
  amount: number;
  currentAmountPaid: number;
  currentTotalPaid: number;
}): Promise<void> {
  const newPaid = input.currentAmountPaid + input.amount;

  const { error } = await supabase
    .from('athlete_subscriptions')
    .update({ amount_paid: newPaid })
    .eq('id', input.subscriptionId);
  if (error) throw error;

  const { error: aErr } = await supabase
    .from('athletes')
    .update({
      total_paid: input.currentTotalPaid + input.amount,
      last_payment: new Date().toISOString().split('T')[0],
    })
    .eq('id', input.athleteId);
  if (aErr) throw aErr;
}

// ---------------------------------------------------------------------------
// Credit
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// RFID
// ---------------------------------------------------------------------------

const normalizeRfid = (uid: string | null | undefined) => {
  if (!uid) return '';
  // Keep only hex characters and uppercase — protect against control chars/newlines
  const cleaned = (uid || '').toString().replace(/[^0-9A-Fa-f]/g, '').trim().toUpperCase();
  return cleaned;
};

export async function findAthleteByRfid(rfidUid: string): Promise<Athlete | null> {
  const norm = normalizeRfid(rfidUid);
  if (!norm) return null;
  const { data, error } = await supabase
    .from('athletes')
    .select(ATHLETE_SELECT)
    .eq('rfid_uid', norm)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as Athlete) ?? null;
}

export async function setAthleteRfid(athleteId: string, rfidUid: string | null): Promise<void> {
  const norm = normalizeRfid(rfidUid);
  const value = norm === '' ? null : norm;
  const { error } = await supabase
    .from('athletes')
    .update({ rfid_uid: value })
    .eq('id', athleteId);
  if (error) throw error;
}

export async function getAthleteRfid(athleteId: string): Promise<string> {
  const { data, error } = await supabase.from('athletes').select('rfid_uid').eq('id', athleteId).maybeSingle();
  if (error) throw error;
  return (data as { rfid_uid: string | null } | null)?.rfid_uid ?? '';
}

// ---------------------------------------------------------------------------
// Séances (subscription session tracking)
// ---------------------------------------------------------------------------

export interface SeanceHistory {
  id: string;
  athlete_id: string;
  athlete_subscription_id: string | null;
  seances_used: number;
  seances_remaining: number;
  used_at: string;
  notes: string | null;
}

export async function listSeanceHistory(athleteId: string): Promise<SeanceHistory[]> {
  const { data, error } = await supabase
    .from('seances_history')
    .select('id, athlete_id, athlete_subscription_id, seances_used, seances_remaining, used_at, notes')
    .eq('athlete_id', athleteId)
    .order('used_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as SeanceHistory[];
}

export interface SessionInfo {
  subscription: { id: string; sessions: number; name: string };
  remaining: number;
  history: SeanceHistory[];
}

/**
 * Resolve the athlete's most recent session-based subscription and how many
 * sessions remain on it. Returns null when they have no session-based plan.
 *
 * Shared by the Scanner and the global RFID listener so the "sessions left"
 * logic lives in one place.
 */
export async function getSessionInfo(athleteId: string): Promise<SessionInfo | null> {
  const [subs, types] = await Promise.all([listAthleteSubscriptions(athleteId), listSubscriptionTypes()]);
  let match: { id: string; sessions: number; name: string } | null = null;
  for (const sub of subs) {                       // newest-first
    const type = types.find((t) => t.id === sub.subscription_id);
    if (type && type.sessions && type.sessions > 0) {
      match = { id: sub.id, sessions: type.sessions, name: type.name };
      break;
    }
  }
  if (!match) return null;

  const history = (await listSeanceHistory(athleteId))
    .filter((h) => h.athlete_subscription_id === match!.id);
  const used = history.reduce((s, h) => s + (h.seances_used || 0), 0);
  return { subscription: match, remaining: Math.max(0, match.sessions - used), history };
}

export async function recordSeance(input: {
  athleteId: string;
  athleteSubscriptionId: string | null;
  seancesRemaining: number;
  notes?: string | null;
}): Promise<void> {
  const { error } = await supabase.from('seances_history').insert({
    athlete_id: input.athleteId,
    athlete_subscription_id: input.athleteSubscriptionId,
    seances_used: 1,
    seances_remaining: input.seancesRemaining,
    notes: input.notes ?? null,
  });
  if (error) throw error;
}

export async function addCredit(input: {
  athleteId: string;
  amount: number;
  description: string | null;
  currentBalance: number;
}): Promise<void> {
  const { error } = await supabase.from('athlete_credits').insert({
    athlete_id: input.athleteId,
    amount: input.amount,
    credit_date: new Date().toISOString().split('T')[0],
    description: input.description?.trim() || 'Credit deposit',
    type: 'deposit',
  });
  if (error) throw error;

  const { error: aErr } = await supabase
    .from('athletes')
    .update({ account_balance: input.currentBalance + input.amount })
    .eq('id', input.athleteId);
  if (aErr) throw aErr;
}
