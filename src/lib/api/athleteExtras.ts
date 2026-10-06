import { supabase } from '@/lib/supabase';
import type { AthleteSubscription } from '@/lib/api/athletes';

const todayIso = () => new Date().toISOString().split('T')[0];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExtraFee {
  id: string;
  athlete_id: string;
  name: string;
  description: string | null;
  product_id: string | null;
  quantity: number;
  unit_price: number;
  total: number;
  amount_paid: number;
  remaining: number;
  fee_date: string;
  created_at: string;
}

export interface ExtraFeeInput {
  athlete_id: string;
  name: string;
  description?: string | null;
  product_id?: string | null;
  quantity: number;
  unit_price: number;
  amount_paid: number;
  fee_date: string;
}

export interface PaymentAllocation {
  kind: 'subscription' | 'fee';
  id: string;
  label: string;
  amount: number;
}

export interface AthletePayment {
  id: string;
  athlete_id: string;
  amount: number;
  payment_date: string;
  description: string | null;
  allocations: PaymentAllocation[];
  created_at: string;
}

export type AttendanceStatus = 'present' | 'absent';

export interface Attendance {
  id: string;
  athlete_id: string;
  att_date: string;
  att_time: string;
  status: AttendanceStatus;
  source: 'manual' | 'scan';
  notes: string | null;
  created_at: string;
}

export interface CreditRow {
  id: string;
  amount: number;
  credit_date: string;
  description: string | null;
  type: 'deposit' | 'used';
  created_at: string;
}

/** One unpaid line an athlete owes: a subscription or an extra fee. */
export interface DebtItem {
  kind: 'subscription' | 'fee';
  id: string;
  label: string;
  date: string;
  total: number;
  paid: number;
  remaining: number;
}

// ---------------------------------------------------------------------------
// Debts
// ---------------------------------------------------------------------------

/** Total debt per athlete (subscriptions + extra fees), in two queries. */
export async function debtByAthlete(): Promise<Record<string, number>> {
  const [subs, fees] = await Promise.all([
    supabase.from('athlete_subscriptions').select('athlete_id, remaining').gt('remaining', 0),
    supabase.from('athlete_extra_fees').select('athlete_id, remaining').gt('remaining', 0),
  ]);
  if (subs.error) throw subs.error;
  const out: Record<string, number> = {};
  for (const r of (subs.data ?? []) as { athlete_id: string; remaining: number }[]) {
    out[r.athlete_id] = (out[r.athlete_id] ?? 0) + Number(r.remaining);
  }
  // The fees table only exists once supabase_update_v2.sql has run; don't break the page without it.
  if (!fees.error) {
    for (const r of (fees.data ?? []) as { athlete_id: string; remaining: number }[]) {
      out[r.athlete_id] = (out[r.athlete_id] ?? 0) + Number(r.remaining);
    }
  }
  return out;
}

/** Every unpaid line for one athlete, oldest first (the order payments settle them). */
export async function listDebtItems(athleteId: string): Promise<DebtItem[]> {
  const [subs, fees] = await Promise.all([
    supabase.from('athlete_subscriptions')
      .select('id, name, price, amount_paid, remaining, payment_date')
      .eq('athlete_id', athleteId).gt('remaining', 0),
    supabase.from('athlete_extra_fees')
      .select('id, name, total, amount_paid, remaining, fee_date')
      .eq('athlete_id', athleteId).gt('remaining', 0),
  ]);
  if (subs.error) throw subs.error;
  if (fees.error) throw fees.error;
  const items: DebtItem[] = [
    ...((subs.data ?? []) as { id: string; name: string; price: number; amount_paid: number; remaining: number; payment_date: string }[])
      .map((s) => ({
        kind: 'subscription' as const, id: s.id, label: s.name, date: s.payment_date,
        total: Number(s.price), paid: Number(s.amount_paid), remaining: Number(s.remaining),
      })),
    ...((fees.data ?? []) as { id: string; name: string; total: number; amount_paid: number; remaining: number; fee_date: string }[])
      .map((f) => ({
        kind: 'fee' as const, id: f.id, label: f.name, date: f.fee_date,
        total: Number(f.total), paid: Number(f.amount_paid), remaining: Number(f.remaining),
      })),
  ];
  return items.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Settle part (or all) of an athlete's debt.
 *
 * The amount is spread over the chosen items oldest first; each item's
 * amount_paid goes up, and one athlete_payments row records the whole thing
 * with its allocation so the history can show exactly what was paid.
 */
export async function payDebt(input: {
  athleteId: string;
  amount: number;
  paymentDate: string;
  description?: string | null;
  items: DebtItem[];
  currentTotalPaid: number;
}): Promise<void> {
  let left = Math.max(0, input.amount);
  const allocations: PaymentAllocation[] = [];

  for (const item of [...input.items].sort((a, b) => a.date.localeCompare(b.date))) {
    if (left <= 0) break;
    const pay = Math.min(left, item.remaining);
    if (pay <= 0) continue;
    const table = item.kind === 'subscription' ? 'athlete_subscriptions' : 'athlete_extra_fees';
    const { error } = await supabase.from(table).update({ amount_paid: item.paid + pay }).eq('id', item.id);
    if (error) throw error;
    allocations.push({ kind: item.kind, id: item.id, label: item.label, amount: pay });
    left -= pay;
  }

  const paid = allocations.reduce((s, a) => s + a.amount, 0);
  if (paid <= 0) return;

  const { error: pErr } = await supabase.from('athlete_payments').insert({
    athlete_id: input.athleteId,
    amount: paid,
    payment_date: input.paymentDate,
    description: input.description?.trim() || null,
    allocations,
  });
  if (pErr) throw pErr;

  const { error: aErr } = await supabase.from('athletes')
    .update({ total_paid: input.currentTotalPaid + paid, last_payment: input.paymentDate })
    .eq('id', input.athleteId);
  if (aErr) throw aErr;
}

export async function listPayments(athleteId: string): Promise<AthletePayment[]> {
  const { data, error } = await supabase.from('athlete_payments')
    .select('*').eq('athlete_id', athleteId)
    .order('payment_date', { ascending: false }).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as AthletePayment[];
}

// ---------------------------------------------------------------------------
// Extra fees (frais supplémentaires)
// ---------------------------------------------------------------------------

/** Move product stock by `delta` units out of the shelf (negative puts units back). */
async function takeFromStock(productId: string, delta: number): Promise<void> {
  if (!delta) return;
  const { data, error } = await supabase.from('products')
    .select('current_stock, sold').eq('id', productId).maybeSingle();
  if (error) throw error;
  if (!data) return; // product deleted since — nothing to adjust
  const row = data as { current_stock: number; sold: number };
  const { error: uErr } = await supabase.from('products').update({
    current_stock: Number(row.current_stock) - delta,
    sold: Math.max(0, Number(row.sold) + delta),
  }).eq('id', productId);
  if (uErr) throw uErr;
}

export async function listExtraFees(athleteId: string): Promise<ExtraFee[]> {
  const { data, error } = await supabase.from('athlete_extra_fees')
    .select('*').eq('athlete_id', athleteId)
    .order('fee_date', { ascending: false }).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ExtraFee[];
}

const feePayload = (i: ExtraFeeInput) => ({
  athlete_id: i.athlete_id,
  name: i.name.trim(),
  description: i.description?.trim() || null,
  product_id: i.product_id || null,
  quantity: i.quantity,
  unit_price: i.unit_price,
  amount_paid: Math.max(0, Math.min(i.amount_paid, i.quantity * i.unit_price)),
  fee_date: i.fee_date || todayIso(),
});

async function bumpTotalPaid(athleteId: string, delta: number): Promise<void> {
  if (!delta) return;
  const { data, error } = await supabase.from('athletes').select('total_paid').eq('id', athleteId).maybeSingle();
  if (error) throw error;
  const cur = Number((data as { total_paid: number } | null)?.total_paid ?? 0);
  const { error: uErr } = await supabase.from('athletes')
    .update({ total_paid: Math.max(0, cur + delta) }).eq('id', athleteId);
  if (uErr) throw uErr;
}

export async function createExtraFee(input: ExtraFeeInput): Promise<void> {
  const payload = feePayload(input);
  const { data, error } = await supabase.from('athlete_extra_fees').insert(payload).select('id').single();
  if (error) throw error;
  try {
    if (payload.product_id) await takeFromStock(payload.product_id, payload.quantity);
  } catch (e) {
    await supabase.from('athlete_extra_fees').delete().eq('id', (data as { id: string }).id);
    throw e;
  }
  await bumpTotalPaid(input.athlete_id, payload.amount_paid);
}

export async function updateExtraFee(prev: ExtraFee, input: ExtraFeeInput): Promise<void> {
  const payload = feePayload(input);
  const { error } = await supabase.from('athlete_extra_fees').update(payload).eq('id', prev.id);
  if (error) throw error;

  // Keep the stock in step with what changed.
  if (prev.product_id && prev.product_id === payload.product_id) {
    await takeFromStock(prev.product_id, payload.quantity - Number(prev.quantity));
  } else {
    if (prev.product_id) await takeFromStock(prev.product_id, -Number(prev.quantity));
    if (payload.product_id) await takeFromStock(payload.product_id, payload.quantity);
  }
  await bumpTotalPaid(input.athlete_id, payload.amount_paid - Number(prev.amount_paid));
}

/** Delete a fee and put its products back on the shelf. */
export async function deleteExtraFee(fee: ExtraFee): Promise<void> {
  const { error } = await supabase.from('athlete_extra_fees').delete().eq('id', fee.id);
  if (error) throw error;
  if (fee.product_id) await takeFromStock(fee.product_id, -Number(fee.quantity));
  await bumpTotalPaid(fee.athlete_id, -Number(fee.amount_paid));
}

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

export async function listAttendance(athleteId: string): Promise<Attendance[]> {
  const { data, error } = await supabase.from('athlete_attendance')
    .select('*').eq('athlete_id', athleteId)
    .order('att_date', { ascending: false }).order('att_time', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Attendance[];
}

export async function addAttendance(input: {
  athleteId: string;
  status: AttendanceStatus;
  date?: string;
  time?: string;
  source?: 'manual' | 'scan';
  notes?: string | null;
}): Promise<void> {
  const row: Record<string, unknown> = {
    athlete_id: input.athleteId,
    status: input.status,
    source: input.source ?? 'manual',
    notes: input.notes?.trim() || null,
  };
  if (input.date) row.att_date = input.date;
  if (input.time) row.att_time = input.time;
  const { error } = await supabase.from('athlete_attendance').insert(row);
  if (error) throw error;
}

export async function deleteAttendance(id: string): Promise<void> {
  const { error } = await supabase.from('athlete_attendance').delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Credits (read-only list for the history)
// ---------------------------------------------------------------------------

export async function listCredits(athleteId: string): Promise<CreditRow[]> {
  const { data, error } = await supabase.from('athlete_credits')
    .select('id, amount, credit_date, description, type, created_at')
    .eq('athlete_id', athleteId).order('credit_date', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CreditRow[];
}

// ---------------------------------------------------------------------------
// Athlete subscriptions: edit / delete
// ---------------------------------------------------------------------------

export interface AthleteSubscriptionPatch {
  name: string;
  price: number;
  payment_date: string;
  expiry_date: string | null;
  amount_paid: number;
}

/**
 * Re-derive the athlete's status/expiry from their latest subscription.
 * Needed after a subscription is edited or deleted.
 */
export async function refreshAthleteStatus(athleteId: string): Promise<void> {
  const { data, error } = await supabase.from('athlete_subscriptions')
    .select('payment_date, expiry_date, created_at')
    .eq('athlete_id', athleteId)
    .order('payment_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  const latest = (data ?? [])[0] as { payment_date: string; expiry_date: string | null } | undefined;

  const patch = latest
    ? {
        subscription_expiry: latest.expiry_date,
        subscription_status: !latest.expiry_date || latest.expiry_date >= todayIso() ? 'active' : 'expired',
        last_payment: latest.payment_date,
      }
    : { subscription_expiry: null, subscription_status: 'inactive' };

  const { error: uErr } = await supabase.from('athletes').update(patch).eq('id', athleteId);
  if (uErr) throw uErr;
}

export async function getLatestSubscription(athleteId: string): Promise<AthleteSubscription | null> {
  const { data, error } = await supabase.from('athlete_subscriptions')
    .select('*').eq('athlete_id', athleteId)
    .order('created_at', { ascending: false }).limit(1);
  if (error) throw error;
  return ((data ?? [])[0] as AthleteSubscription) ?? null;
}

export async function updateAthleteSubscription(
  prev: AthleteSubscription,
  patch: AthleteSubscriptionPatch,
): Promise<void> {
  const { error } = await supabase.from('athlete_subscriptions').update({
    name: patch.name.trim(),
    price: patch.price,
    payment_date: patch.payment_date,
    expiry_date: patch.expiry_date || null,
    amount_paid: Math.max(0, patch.amount_paid),
  }).eq('id', prev.id);
  if (error) throw error;
  await bumpTotalPaid(prev.athlete_id, patch.amount_paid - Number(prev.amount_paid));
  await refreshAthleteStatus(prev.athlete_id);
}

export async function deleteAthleteSubscription(sub: AthleteSubscription): Promise<void> {
  const { error } = await supabase.from('athlete_subscriptions').delete().eq('id', sub.id);
  if (error) throw error;
  await bumpTotalPaid(sub.athlete_id, -Number(sub.amount_paid));
  await refreshAthleteStatus(sub.athlete_id);
}
