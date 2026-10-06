import { supabase } from '@/lib/supabase';
import { DateRange, StreamEntry, listRevenue, listExpenseStream } from '@/lib/api/caisse';

/** Everything the Reports page shows for one period. Each part loads independently. */
export interface ReportData {
  range: DateRange;
  revenue: StreamEntry[];
  expenses: StreamEntry[];
  newAthletes: { id: string; full_name: string; phone: string | null; created_at: string }[];
  subscriptions: { id: string; name: string; price: number; amount_paid: number; remaining: number; payment_date: string; expiry_date: string | null; athletes: { full_name: string } | null }[];
  fees: { id: string; name: string; quantity: number; total: number; amount_paid: number; remaining: number; fee_date: string; athletes: { full_name: string } | null }[];
  payments: { id: string; amount: number; payment_date: string; description: string | null; athletes: { full_name: string } | null }[];
  attendance: { id: string; att_date: string; status: string; source: string; athletes: { full_name: string } | null }[];
  freeSessions: { id: string; passenger_name: string | null; price: number; session_date: string; athletes: { full_name: string } | null }[];
  sales: { id: string; invoice_number: string; customer_name: string; creation_date: string; total_amount: number; amount_paid: number; status: string }[];
  purchases: { id: string; invoice_number: string; invoice_date: string; total_amount: number; amount_paid: number; status: string; suppliers: { name: string } | null }[];
  expenseRows: { id: string; name: string; amount: number; expense_date: string; notes: string | null; expense_categories: { name: string } | null }[];
  products: { id: string; name: string; current_stock: number; min_stock_level: number; real_price: number; sell_price: number }[];
  outstanding: { athlete_id: string; full_name: string; remaining: number }[];
  /** Parts that could not be loaded (missing permission or table). */
  failed: string[];
}

export async function loadReport(range: DateRange): Promise<ReportData> {
  const failed: string[] = [];
  const safe = async <T,>(name: string, run: () => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> => {
    try {
      const { data, error } = await run();
      if (error) throw error;
      return (data ?? []) as T[];
    } catch {
      failed.push(name);
      return [];
    }
  };

  const [
    revenue, expenses, newAthletes, subscriptions, fees, payments, attendance, freeSessions,
    sales, purchases, expenseRows, products, subsDebt, feesDebt,
  ] = await Promise.all([
    listRevenue(range).catch(() => { failed.push('revenue'); return [] as StreamEntry[]; }),
    listExpenseStream(range).catch(() => { failed.push('expenses'); return [] as StreamEntry[]; }),
    safe('athletes', () => supabase.from('athletes').select('id, full_name, phone, created_at')
      .gte('created_at', `${range.from}T00:00:00`).lte('created_at', `${range.to}T23:59:59`).order('created_at', { ascending: false })),
    safe('subscriptions', () => supabase.from('athlete_subscriptions')
      .select('id, name, price, amount_paid, remaining, payment_date, expiry_date, athletes ( full_name )')
      .gte('payment_date', range.from).lte('payment_date', range.to).order('payment_date', { ascending: false })),
    safe('fees', () => supabase.from('athlete_extra_fees')
      .select('id, name, quantity, total, amount_paid, remaining, fee_date, athletes ( full_name )')
      .gte('fee_date', range.from).lte('fee_date', range.to).order('fee_date', { ascending: false })),
    safe('payments', () => supabase.from('athlete_payments')
      .select('id, amount, payment_date, description, athletes ( full_name )')
      .gte('payment_date', range.from).lte('payment_date', range.to).order('payment_date', { ascending: false })),
    safe('attendance', () => supabase.from('athlete_attendance')
      .select('id, att_date, status, source, athletes ( full_name )')
      .gte('att_date', range.from).lte('att_date', range.to).order('att_date', { ascending: false })),
    safe('freeSessions', () => supabase.from('free_sessions')
      .select('id, passenger_name, price, session_date, athletes ( full_name )')
      .gte('session_date', range.from).lte('session_date', range.to).order('session_date', { ascending: false })),
    safe('sales', () => supabase.from('sales_invoices')
      .select('id, invoice_number, customer_name, creation_date, total_amount, amount_paid, status')
      .gte('creation_date', range.from).lte('creation_date', range.to).order('creation_date', { ascending: false })),
    safe('purchases', () => supabase.from('purchase_invoices')
      .select('id, invoice_number, invoice_date, total_amount, amount_paid, status, suppliers ( name )')
      .gte('invoice_date', range.from).lte('invoice_date', range.to).order('invoice_date', { ascending: false })),
    safe('expenseRows', () => supabase.from('expenses')
      .select('id, name, amount, expense_date, notes, expense_categories ( name )')
      .gte('expense_date', range.from).lte('expense_date', range.to).order('expense_date', { ascending: false })),
    safe('products', () => supabase.from('products')
      .select('id, name, current_stock, min_stock_level, real_price, sell_price').order('name')),
    safe<{ athlete_id: string; remaining: number; athletes: { full_name: string } | null }>('debts', () =>
      supabase.from('athlete_subscriptions').select('athlete_id, remaining, athletes ( full_name )').gt('remaining', 0)),
    safe<{ athlete_id: string; remaining: number; athletes: { full_name: string } | null }>('debts', () =>
      supabase.from('athlete_extra_fees').select('athlete_id, remaining, athletes ( full_name )').gt('remaining', 0)),
  ]);

  const debtMap = new Map<string, { athlete_id: string; full_name: string; remaining: number }>();
  for (const r of [...subsDebt, ...feesDebt]) {
    const cur = debtMap.get(r.athlete_id) ?? { athlete_id: r.athlete_id, full_name: r.athletes?.full_name ?? '—', remaining: 0 };
    cur.remaining += Number(r.remaining);
    debtMap.set(r.athlete_id, cur);
  }

  return {
    range, revenue, expenses,
    newAthletes: newAthletes as ReportData['newAthletes'],
    subscriptions: subscriptions as ReportData['subscriptions'],
    fees: fees as ReportData['fees'],
    payments: payments as ReportData['payments'],
    attendance: attendance as ReportData['attendance'],
    freeSessions: freeSessions as ReportData['freeSessions'],
    sales: sales as ReportData['sales'],
    purchases: purchases as ReportData['purchases'],
    expenseRows: expenseRows as ReportData['expenseRows'],
    products: products as ReportData['products'],
    outstanding: Array.from(debtMap.values()).sort((a, b) => b.remaining - a.remaining),
    failed: Array.from(new Set(failed)),
  };
}
