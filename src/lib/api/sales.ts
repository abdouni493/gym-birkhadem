import { supabase } from '@/lib/supabase';

export interface SalesInvoiceItem {
  id: string;
  sales_invoice_id: string;
  product_id: string | null;
  name: string;
  type: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export interface SalesInvoice {
  id: string;
  invoice_number: string;
  client_id: string | null;
  customer_name: string;
  client_phone: string | null;
  creation_date: string;
  status: 'paid' | 'debt';
  subtotal: number;
  discount: number;
  total_amount: number;
  amount_paid: number;
  payment_method: string | null;
  sales_invoice_items?: SalesInvoiceItem[];
}

export interface NewSaleItem {
  product_id: string | null;
  name: string;
  quantity: number;
  unit_price: number;
}

export interface NewSale {
  client_id: string | null;
  customer_name: string;
  client_phone: string | null;
  subtotal: number;
  discount: number;
  total_amount: number;
  amount_paid: number;
  payment_method: string;
  items: NewSaleItem[];
}

export function generateInvoiceNumber(): string {
  return `SAL-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
}

/**
 * Record a sale: header + line items + stock decrement.
 *
 * No server transaction in PostgREST, so this runs in stages and unwinds the
 * invoice (cascading its items) if a later stage fails, to avoid a sale that
 * decremented stock but was never fully written.
 */
export async function createSale(sale: NewSale): Promise<string> {
  const status: SalesInvoice['status'] = sale.amount_paid >= sale.total_amount ? 'paid' : 'debt';

  const { data: inv, error } = await supabase
    .from('sales_invoices')
    .insert({
      invoice_number: generateInvoiceNumber(),
      client_id: sale.client_id,
      customer_name: sale.customer_name,
      client_phone: sale.client_phone,
      creation_date: new Date().toISOString().split('T')[0],
      status,
      subtotal: sale.subtotal,
      discount: sale.discount,
      total_amount: sale.total_amount,
      amount_paid: Math.min(sale.amount_paid, sale.total_amount),
      payment_method: sale.payment_method,
    })
    .select('id')
    .single();
  if (error) throw error;
  const invoiceId = (inv as { id: string }).id;

  try {
    if (sale.items.length) {
      const { error: itErr } = await supabase.from('sales_invoice_items').insert(
        sale.items.map((it) => ({
          sales_invoice_id: invoiceId,
          product_id: it.product_id,
          name: it.name,
          type: 'produit',
          quantity: it.quantity,
          unit_price: it.unit_price,
        })),
      );
      if (itErr) throw itErr;
    }

    // Decrement stock per product line. Read-modify-write is acceptable here:
    // a single till operates serially.
    for (const it of sale.items) {
      if (!it.product_id) continue;
      const { data: prod, error: pErr } = await supabase
        .from('products').select('current_stock, sold').eq('id', it.product_id).single();
      if (pErr) throw pErr;
      const p = prod as { current_stock: number; sold: number };
      const newStock = Math.max(0, p.current_stock - it.quantity);
      const { error: uErr } = await supabase
        .from('products')
        .update({ current_stock: newStock, sold: p.sold + it.quantity })
        .eq('id', it.product_id);
      if (uErr) throw uErr;
    }
  } catch (e) {
    await supabase.from('sales_invoices').delete().eq('id', invoiceId);
    throw e;
  }

  return invoiceId;
}

export async function listSalesInvoices(): Promise<SalesInvoice[]> {
  const { data, error } = await supabase
    .from('sales_invoices')
    .select(`
      id, invoice_number, client_id, customer_name, client_phone, creation_date,
      status, subtotal, discount, total_amount, amount_paid, payment_method,
      sales_invoice_items ( id, sales_invoice_id, product_id, name, type, quantity, unit_price, total )
    `)
    .order('creation_date', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as SalesInvoice[];
}

export async function payInvoice(invoice: SalesInvoice, amount: number): Promise<void> {
  const newPaid = Math.min(invoice.total_amount, invoice.amount_paid + amount);
  const { error } = await supabase
    .from('sales_invoices')
    .update({ amount_paid: newPaid, status: newPaid >= invoice.total_amount ? 'paid' : 'debt' })
    .eq('id', invoice.id);
  if (error) throw error;
}

export async function updateInvoice(id: string, input: {
  client_id: string | null;
  customer_name: string;
  client_phone: string | null;
  subtotal: number;
  discount: number;
  total_amount: number;
  amount_paid: number;
  items: { id: string; quantity: number; unit_price: number }[];
}): Promise<void> {
  const status = input.amount_paid >= input.total_amount ? 'paid' : 'debt';
  const { error } = await supabase
    .from('sales_invoices')
    .update({
      client_id: input.client_id,
      customer_name: input.customer_name,
      client_phone: input.client_phone,
      subtotal: input.subtotal,
      discount: input.discount,
      total_amount: input.total_amount,
      amount_paid: Math.min(input.amount_paid, input.total_amount),
      status,
    })
    .eq('id', id);
  if (error) throw error;

  // Update each line's quantity/price (totals are generated columns).
  for (const it of input.items) {
    const { error: e } = await supabase
      .from('sales_invoice_items')
      .update({ quantity: it.quantity, unit_price: it.unit_price })
      .eq('id', it.id);
    if (e) throw e;
  }
}

export async function deleteInvoice(id: string): Promise<void> {
  const { error } = await supabase.from('sales_invoices').delete().eq('id', id);
  if (error) throw error;
}
