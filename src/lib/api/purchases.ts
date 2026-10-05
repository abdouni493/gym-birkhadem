import { supabase } from '@/lib/supabase';

export interface PurchaseItem {
  id: string;
  purchase_invoice_id: string;
  product_id: string | null;
  product_name: string;
  barcode: string | null;
  quantity: number;
  purchase_price: number;
  selling_price: number;
  min_stock_level: number | null;
  expiry_date: string | null;
  line_total: number;
}

export interface PurchaseInvoice {
  id: string;
  invoice_number: string;
  supplier_id: string | null;
  total_amount: number;
  amount_paid: number;
  invoice_date: string;
  status: 'paid' | 'partial' | 'pending';
  notes: string | null;
  suppliers?: { id: string; name: string; phone: string | null; address: string | null } | null;
  purchase_invoice_items?: PurchaseItem[];
}

export interface NewPurchaseLine {
  product_id: string;
  product_name: string;
  barcode: string | null;
  quantity: number;
  purchase_price: number;
  selling_price: number;
  min_stock_level: number | null;
  expiry_date: string | null;
}

export function statusFromPayment(total: number, paid: number): PurchaseInvoice['status'] {
  if (paid <= 0) return 'pending';
  if (paid >= total) return 'paid';
  return 'partial';
}

export async function listPurchaseInvoices(): Promise<PurchaseInvoice[]> {
  const { data, error } = await supabase
    .from('purchase_invoices')
    .select(`
      id, invoice_number, supplier_id, total_amount, amount_paid, invoice_date, status, notes,
      suppliers ( id, name, phone, address ),
      purchase_invoice_items ( id, purchase_invoice_id, product_id, product_name, barcode, quantity, purchase_price, selling_price, min_stock_level, expiry_date, line_total )
    `)
    .order('invoice_date', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as PurchaseInvoice[];
}

function invoiceNumber(): string {
  return `PUR-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
}

/**
 * Create a purchase invoice: header + items + stock top-up + supplier aggregate.
 *
 * Applies stock deltas per line (adds quantity, refreshes cost/sell/expiry). No
 * server transaction, so on failure the invoice is deleted (items cascade) —
 * but any stock already applied is NOT unwound, matching the legacy behaviour
 * of a best-effort multi-step write. Stage the stock updates last to minimise
 * that window.
 */
export async function createPurchase(input: {
  supplier_id: string;
  amount_paid: number;
  total: number;
  notes: string | null;
  items: NewPurchaseLine[];
}): Promise<void> {
  const status = statusFromPayment(input.total, input.amount_paid);
  const today = new Date().toISOString().split('T')[0];

  const { data: inv, error } = await supabase
    .from('purchase_invoices')
    .insert({
      invoice_number: invoiceNumber(),
      supplier_id: input.supplier_id,
      total_amount: input.total,
      amount_paid: input.amount_paid,
      invoice_date: today,
      status,
      notes: input.notes?.trim() || null,
    })
    .select('id')
    .single();
  if (error) throw error;
  const invoiceId = (inv as { id: string }).id;

  const { error: itErr } = await supabase.from('purchase_invoice_items').insert(
    input.items.map((it) => ({
      purchase_invoice_id: invoiceId,
      product_id: it.product_id,
      product_name: it.product_name,
      barcode: it.barcode,
      quantity: it.quantity,
      purchase_price: it.purchase_price,
      selling_price: it.selling_price,
      min_stock_level: it.min_stock_level,
      expiry_date: it.expiry_date,
    })),
  );
  if (itErr) {
    await supabase.from('purchase_invoices').delete().eq('id', invoiceId);
    throw itErr;
  }

  // Top up stock per line.
  for (const it of input.items) {
    const { data: prod, error: pErr } = await supabase
      .from('products')
      .select('initial_quantity, current_stock, min_stock_level')
      .eq('id', it.product_id).single();
    if (pErr) continue;
    const p = prod as { initial_quantity: number; current_stock: number; min_stock_level: number };
    await supabase.from('products').update({
      initial_quantity: p.initial_quantity + it.quantity,
      current_stock: p.current_stock + it.quantity,
      min_stock_level: it.min_stock_level ?? p.min_stock_level,
      real_price: it.purchase_price,
      sell_price: it.selling_price,
      expiry_date: it.expiry_date || null,
    }).eq('id', it.product_id);
  }

  // Supplier aggregate.
  const { data: sup } = await supabase
    .from('suppliers').select('total_purchases').eq('id', input.supplier_id).single();
  if (sup) {
    await supabase.from('suppliers').update({
      total_purchases: Number((sup as { total_purchases: number }).total_purchases) + input.total,
      last_purchase_date: today,
    }).eq('id', input.supplier_id);
  }
}

/** Update header fields only (does not re-apply stock, to avoid double counting). */
export async function updatePurchaseHeader(id: string, input: {
  supplier_id: string; total: number; amount_paid: number; notes: string | null;
}): Promise<void> {
  const { error } = await supabase
    .from('purchase_invoices')
    .update({
      supplier_id: input.supplier_id,
      total_amount: input.total,
      amount_paid: input.amount_paid,
      status: statusFromPayment(input.total, input.amount_paid),
      notes: input.notes?.trim() || null,
    })
    .eq('id', id);
  if (error) throw error;
}

export async function payPurchase(invoice: PurchaseInvoice, amount: number): Promise<void> {
  const newPaid = Math.min(invoice.total_amount, invoice.amount_paid + amount);
  const { error } = await supabase
    .from('purchase_invoices')
    .update({ amount_paid: newPaid, status: statusFromPayment(invoice.total_amount, newPaid) })
    .eq('id', invoice.id);
  if (error) throw error;
}

export async function deletePurchase(id: string): Promise<void> {
  const { error } = await supabase.from('purchase_invoices').delete().eq('id', id);
  if (error) throw error;
}
