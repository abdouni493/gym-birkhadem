import { supabase } from '@/lib/supabase';

export type CashDirection = 'deposit' | 'withdraw';

export interface CashTransaction {
  id: string;
  direction: CashDirection;
  amount: number;
  transaction_date: string;
  description: string | null;
  created_at: string;
}

/** A row from v_revenue_stream / v_expense_stream. */
export interface StreamEntry {
  source: string;
  interface_key: string;
  ref_id: string;
  entry_date: string;
  amount: number;
  label: string;
  detail: string;
}

export interface OutstandingRow {
  athlete_id: string;
  full_name: string;
  phone: string | null;
  photo_url: string | null;
  subscription_id: string;
  subscription_name: string;
  price: number;
  amount_paid: number;
  remaining: number;
  payment_date: string;
  expiry_date: string | null;
}

// ---------------------------------------------------------------------------
// Date range presets
// ---------------------------------------------------------------------------

export type RangePreset = 'today' | 'week' | 'month' | 'custom' | 'all';

const iso = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export interface DateRange { from: string; to: string }

/**
 * Resolve a preset into a concrete range.
 * 'week'/'month' mean the last 7/30 days ending today, matching the spec's
 * "this day / last week / last month" filters.
 */
export function resolveRange(preset: RangePreset, custom?: Partial<DateRange>): DateRange {
  const now = new Date();
  const today = iso(now);

  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'week': {
      const d = new Date(now);
      d.setDate(d.getDate() - 6); // inclusive of today = 7 days
      return { from: iso(d), to: today };
    }
    case 'month': {
      const d = new Date(now);
      d.setDate(d.getDate() - 29);
      return { from: iso(d), to: today };
    }
    case 'all':
      return { from: '1970-01-01', to: '2999-12-31' };
    case 'custom':
    default:
      return { from: custom?.from || today, to: custom?.to || today };
  }
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export async function listTransactions(range: DateRange): Promise<CashTransaction[]> {
  const { data, error } = await supabase
    .from('cash_transactions')
    .select('id, direction, amount, transaction_date, description, created_at')
    .gte('transaction_date', range.from)
    .lte('transaction_date', range.to)
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CashTransaction[];
}

export async function addTransaction(input: {
  direction: CashDirection;
  amount: number;
  transaction_date: string;
  description: string | null;
}): Promise<void> {
  const { error } = await supabase.from('cash_transactions').insert({
    direction: input.direction,
    amount: input.amount,
    transaction_date: input.transaction_date,
    description: input.description?.trim() || null,
  });
  if (error) throw error;
}

export async function deleteTransaction(id: string): Promise<void> {
  const { error } = await supabase.from('cash_transactions').delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Streams + balance
// ---------------------------------------------------------------------------

export async function listRevenue(range: DateRange): Promise<StreamEntry[]> {
  const { data, error } = await supabase
    .from('v_revenue_stream')
    .select('*')
    .gte('entry_date', range.from)
    .lte('entry_date', range.to)
    .order('entry_date', { ascending: false });
  if (error) throw error;
  return (data ?? []) as StreamEntry[];
}

export async function listExpenseStream(range: DateRange): Promise<StreamEntry[]> {
  const { data, error } = await supabase
    .from('v_expense_stream')
    .select('*')
    .gte('entry_date', range.from)
    .lte('entry_date', range.to)
    .order('entry_date', { ascending: false });
  if (error) throw error;
  return (data ?? []) as StreamEntry[];
}

export async function listOutstanding(): Promise<OutstandingRow[]> {
  const { data, error } = await supabase
    .from('v_athlete_outstanding')
    .select('*')
    .order('payment_date', { ascending: false });
  if (error) throw error;
  return (data ?? []) as OutstandingRow[];
}

/**
 * The all-time caisse balance (everything in minus everything out).
 *
 * Deliberately NOT range-filtered: the money in the drawer is a running total,
 * not a property of the dates being viewed.
 */
export async function getCaisseBalance(): Promise<{ total_in: number; total_out: number; balance: number }> {
  const { data, error } = await supabase.from('v_caisse_balance').select('*').maybeSingle();
  if (error) throw error;
  return (data as { total_in: number; total_out: number; balance: number })
    ?? { total_in: 0, total_out: 0, balance: 0 };
}
