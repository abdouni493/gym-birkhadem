import { supabase } from '@/lib/supabase';
import type { AcompteRow, AbsenceRow, PaymentRow, PayType, UnpaidPeriod } from '@/lib/workerPay';

export interface Role {
  id: string;
  name: string;
  is_admin: boolean;
}

export interface Worker {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  birthday: string | null;
  id_card_number: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  photo_url: string | null;
  role_id: string | null;
  pay_enabled: boolean;
  pay_type: PayType | null;
  pay_amount: number;
  start_date: string;
  status: 'active' | 'inactive';
  user_id: string | null;
  username: string | null;
  account_active: boolean;
  created_at: string;
  roles?: Role | null;
}

const WORKER_SELECT = `
  id, first_name, last_name, full_name, birthday, id_card_number, phone, email,
  address, photo_url, role_id, pay_enabled, pay_type, pay_amount, start_date,
  status, user_id, username, account_active, created_at,
  roles ( id, name, is_admin )
`;

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export async function listRoles(): Promise<Role[]> {
  const { data, error } = await supabase.from('roles').select('*').order('name');
  if (error) throw error;
  return (data ?? []) as Role[];
}

export async function createRole(name: string): Promise<Role> {
  const { data, error } = await supabase
    .from('roles')
    .insert({ name: name.trim(), is_admin: false })
    .select()
    .single();
  if (error) throw error;
  return data as Role;
}

// ---------------------------------------------------------------------------
// Workers
// ---------------------------------------------------------------------------

export async function listWorkers(): Promise<Worker[]> {
  const { data, error } = await supabase
    .from('workers')
    .select(WORKER_SELECT)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Worker[];
}

export async function getWorker(id: string): Promise<Worker | null> {
  const { data, error } = await supabase.from('workers').select(WORKER_SELECT).eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as unknown as Worker) ?? null;
}

export interface WorkerInput {
  first_name: string;
  last_name: string;
  birthday?: string | null;
  id_card_number?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  photo_url?: string | null;
  role_id: string | null;
  pay_enabled: boolean;
  pay_type: PayType | null;
  pay_amount: number;
  start_date: string;
  status?: 'active' | 'inactive';
}

/**
 * Blank optional fields arrive from the form as '' but the columns are
 * nullable-with-constraints; normalise so we never write empty strings.
 */
const clean = (input: WorkerInput) => ({
  ...input,
  birthday: input.birthday || null,
  id_card_number: input.id_card_number?.trim() || null,
  phone: input.phone?.trim() || null,
  email: input.email?.trim().toLowerCase() || null,
  address: input.address?.trim() || null,
  // The DB CHECK requires type+amount whenever pay is enabled.
  pay_type: input.pay_enabled ? input.pay_type : null,
  pay_amount: input.pay_enabled ? input.pay_amount : 0,
});

export async function createWorker(input: WorkerInput): Promise<Worker> {
  const { data, error } = await supabase
    .from('workers')
    .insert(clean(input))
    .select(WORKER_SELECT)
    .single();
  if (error) throw error;
  return data as unknown as Worker;
}

export async function updateWorker(id: string, input: WorkerInput): Promise<Worker> {
  const { data, error } = await supabase
    .from('workers')
    .update(clean(input))
    .eq('id', id)
    .select(WORKER_SELECT)
    .single();
  if (error) throw error;
  return data as unknown as Worker;
}

export async function deleteWorker(id: string): Promise<void> {
  // Acomptes/absences/payments/permissions cascade via FK ON DELETE CASCADE.
  // The auth user (if any) is removed by the manage_worker_account RPC / cleanup trigger.
  const { error } = await supabase.from('workers').delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

export interface PermRow { interface_key: string; action_key: string | null }

export async function getWorkerPermissions(workerId: string): Promise<PermRow[]> {
  const { data, error } = await supabase
    .from('worker_permissions')
    .select('interface_key, action_key')
    .eq('worker_id', workerId);
  if (error) throw error;
  return (data ?? []) as PermRow[];
}

/**
 * Replace a worker's permissions wholesale.
 *
 * Delete-then-insert rather than diffing: the set is tiny, and it guarantees
 * the stored state matches the dialog exactly with no orphan rows.
 */
export async function setWorkerPermissions(workerId: string, rows: PermRow[]): Promise<void> {
  const { error: delErr } = await supabase
    .from('worker_permissions')
    .delete()
    .eq('worker_id', workerId);
  if (delErr) throw delErr;

  if (rows.length === 0) return;

  const { error } = await supabase
    .from('worker_permissions')
    .insert(rows.map((r) => ({ worker_id: workerId, interface_key: r.interface_key, action_key: r.action_key })));
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Acomptes
// ---------------------------------------------------------------------------

export async function listAcomptes(workerId: string): Promise<AcompteRow[]> {
  const { data, error } = await supabase
    .from('worker_acomptes')
    .select('id, acompte_date, description, amount, settled_payment_id')
    .eq('worker_id', workerId)
    .order('acompte_date', { ascending: false });
  if (error) throw error;
  return (data ?? []) as AcompteRow[];
}

export async function addAcompte(workerId: string, input: {
  acompte_date: string; description: string | null; amount: number;
}): Promise<void> {
  const { error } = await supabase.from('worker_acomptes').insert({
    worker_id: workerId,
    acompte_date: input.acompte_date,
    description: input.description?.trim() || null,
    amount: input.amount,
  });
  if (error) throw error;
}

export async function deleteAcompte(id: string): Promise<void> {
  const { error } = await supabase.from('worker_acomptes').delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Absences
// ---------------------------------------------------------------------------

export async function listAbsences(workerId: string): Promise<AbsenceRow[]> {
  const { data, error } = await supabase
    .from('worker_absences')
    .select('id, absence_date, description, cost, settled_payment_id')
    .eq('worker_id', workerId)
    .order('absence_date', { ascending: false });
  if (error) throw error;
  return (data ?? []) as AbsenceRow[];
}

export async function addAbsence(workerId: string, input: {
  absence_date: string; description: string | null; cost: number;
}): Promise<void> {
  const { error } = await supabase.from('worker_absences').insert({
    worker_id: workerId,
    absence_date: input.absence_date,
    description: input.description?.trim() || null,
    cost: input.cost,
  });
  if (error) throw error;
}

export async function deleteAbsence(id: string): Promise<void> {
  const { error } = await supabase.from('worker_absences').delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export async function listPayments(workerId: string): Promise<PaymentRow[]> {
  const { data, error } = await supabase
    .from('worker_payments')
    .select('id, period_start, period_end, final_amount, payment_date, description')
    .eq('worker_id', workerId)
    .order('payment_date', { ascending: false });
  if (error) throw error;
  return (data ?? []) as PaymentRow[];
}

export interface RecordPaymentInput {
  workerId: string;
  periods: UnpaidPeriod[];
  gross: number;
  acomptesTotal: number;
  absencesTotal: number;
  computed: number;
  finalAmount: number;
  isManualOverride: boolean;
  paymentDate: string;
  description: string | null;
  acompteIds: string[];
  absenceIds: string[];
}

/**
 * Record a settlement and mark the deducted acomptes/absences as settled.
 *
 * PostgREST has no multi-statement transaction, so this is three calls. If the
 * settle-marking fails after the payment row lands, the payment is rolled back
 * by hand — otherwise those advances would silently be deducted twice.
 */
export async function recordPayment(input: RecordPaymentInput): Promise<string> {
  if (input.periods.length === 0) throw new Error('Select at least one period to pay.');

  const sorted = [...input.periods].sort((a, b) => a.start.localeCompare(b.start));

  const { data, error } = await supabase
    .from('worker_payments')
    .insert({
      worker_id: input.workerId,
      period_start: sorted[0].start,
      period_end: sorted[sorted.length - 1].end,
      gross_amount: input.gross,
      acomptes_total: input.acomptesTotal,
      absences_total: input.absencesTotal,
      computed_amount: input.computed,
      final_amount: input.finalAmount,
      is_manual_override: input.isManualOverride,
      payment_date: input.paymentDate,
      description: input.description?.trim() || null,
    })
    .select('id')
    .single();

  if (error) throw error;
  const paymentId = (data as { id: string }).id;

  try {
    if (input.acompteIds.length) {
      const { error: e } = await supabase
        .from('worker_acomptes')
        .update({ settled_payment_id: paymentId })
        .in('id', input.acompteIds);
      if (e) throw e;
    }
    if (input.absenceIds.length) {
      const { error: e } = await supabase
        .from('worker_absences')
        .update({ settled_payment_id: paymentId })
        .in('id', input.absenceIds);
      if (e) throw e;
    }
  } catch (e) {
    await supabase.from('worker_payments').delete().eq('id', paymentId);
    throw new Error(
      `Payment was rolled back because the advances could not be marked as settled: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
  }

  return paymentId;
}

export async function updatePayment(id: string, input: {
  final_amount: number; payment_date: string; description: string | null;
}): Promise<void> {
  const { error } = await supabase
    .from('worker_payments')
    .update({
      final_amount: input.final_amount,
      payment_date: input.payment_date,
      description: input.description?.trim() || null,
      is_manual_override: true, // an edited figure is by definition manual
    })
    .eq('id', id);
  if (error) throw error;
}

/** Unsettle anything this payment covered, then remove it. */
export async function deletePayment(id: string): Promise<void> {
  await supabase.from('worker_acomptes').update({ settled_payment_id: null }).eq('settled_payment_id', id);
  await supabase.from('worker_absences').update({ settled_payment_id: null }).eq('settled_payment_id', id);
  const { error } = await supabase.from('worker_payments').delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Login accounts (via the manage_worker_account RPC — see supabase_schema.sql)
// ---------------------------------------------------------------------------

type AccountAction = 'create' | 'update_password' | 'set_active' | 'delete';

export async function manageWorkerAccount(payload: {
  action: AccountAction;
  worker_id: string;
  email?: string;
  password?: string;
  username?: string;
  active?: boolean;
}): Promise<void> {
  // manage_worker_account() writes auth.users/auth.identities directly and
  // checks workers:'account' itself, so no Edge Function deploy is needed.
  const { error } = await supabase.rpc('manage_worker_account', {
    p_action: payload.action,
    p_worker_id: payload.worker_id,
    p_email: payload.email?.trim().toLowerCase() ?? null,
    p_password: payload.password ?? null,
    p_username: payload.username ?? null,
    p_active: payload.active ?? true,
  });
  if (error) throw error;
}
