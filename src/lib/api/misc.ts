import { supabase } from '@/lib/supabase';

// ---- Store settings -------------------------------------------------------

export interface StoreSettingsRow {
  id: string;
  name: string | null;
  description: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  nif: string | null;
  nis: string | null;
  article: string | null;
  rc: string | null;
  logo_url: string | null;
  currency: string | null;
}

export async function getStoreSettings(): Promise<StoreSettingsRow | null> {
  const { data, error } = await supabase.from('store_settings').select('*').eq('id', 'store').maybeSingle();
  if (error) throw error;
  return (data as StoreSettingsRow) ?? null;
}

export async function saveStoreSettings(input: Partial<StoreSettingsRow>): Promise<void> {
  const { error } = await supabase.from('store_settings').upsert({ ...input, id: 'store' });
  if (error) throw error;
}

/** Update the signed-in worker's own name (row where user_id = auth.uid()). */
export async function updateOwnProfile(input: { first_name: string; last_name: string }): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('Not signed in.');
  const { error } = await supabase
    .from('workers')
    .update({ first_name: input.first_name, last_name: input.last_name })
    .eq('user_id', auth.user.id);
  if (error) throw error;
}

/** Change the signed-in user's own auth password. */
export async function updateOwnPassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

// ===========================================================================
// Small CRUD domains that don't warrant their own file:
// expenses, clients, suppliers.
// ===========================================================================

// ---- Expenses -------------------------------------------------------------

export interface Expense {
  id: string;
  name: string;
  amount: number;
  expense_date: string;
  notes: string | null;
  receipt_url: string | null;
}

export async function listExpenses(): Promise<Expense[]> {
  const { data, error } = await supabase
    .from('expenses')
    .select('id, name, amount, expense_date, notes, receipt_url')
    .order('expense_date', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Expense[];
}

export async function createExpense(input: {
  name: string; amount: number; expense_date: string; notes?: string | null;
}): Promise<void> {
  const { error } = await supabase.from('expenses').insert({
    name: input.name.trim(),
    amount: input.amount,
    expense_date: input.expense_date,
    notes: input.notes?.trim() || null,
  });
  if (error) throw error;
}

export async function updateExpense(id: string, input: {
  name: string; amount: number; expense_date: string; notes?: string | null;
}): Promise<void> {
  const { error } = await supabase.from('expenses').update({
    name: input.name.trim(),
    amount: input.amount,
    expense_date: input.expense_date,
    notes: input.notes?.trim() || null,
  }).eq('id', id);
  if (error) throw error;
}

export async function deleteExpense(id: string): Promise<void> {
  const { error } = await supabase.from('expenses').delete().eq('id', id);
  if (error) throw error;
}

// ---- Clients --------------------------------------------------------------

export interface Client {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  created_at: string;
}

export async function listClients(): Promise<Client[]> {
  const { data, error } = await supabase
    .from('clients')
    .select('id, name, phone, address, created_at')
    .order('name');
  if (error) throw error;
  return (data ?? []) as Client[];
}

export async function createClient(input: { name: string; phone?: string | null; address?: string | null }): Promise<void> {
  const { error } = await supabase.from('clients').insert({
    name: input.name.trim(),
    phone: input.phone?.trim() || null,
    address: input.address?.trim() || null,
  });
  if (error) throw error;
}

export async function updateClient(id: string, input: { name: string; phone?: string | null; address?: string | null }): Promise<void> {
  const { error } = await supabase.from('clients').update({
    name: input.name.trim(),
    phone: input.phone?.trim() || null,
    address: input.address?.trim() || null,
  }).eq('id', id);
  if (error) throw error;
}

export async function deleteClient(id: string): Promise<void> {
  const { error } = await supabase.from('clients').delete().eq('id', id);
  if (error) throw error;
}

export interface ClientInvoice {
  id: string;
  invoice_number: string;
  creation_date: string;
  total_amount: number;
  amount_paid: number;
  status: string;
}

/** A client's sales invoices, for the purchase-history dialog. */
export async function listClientInvoices(clientId: string): Promise<ClientInvoice[]> {
  const { data, error } = await supabase
    .from('sales_invoices')
    .select('id, invoice_number, creation_date, total_amount, amount_paid, status')
    .eq('client_id', clientId)
    .order('creation_date', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ClientInvoice[];
}

// ---- Suppliers ------------------------------------------------------------

export interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  total_purchases: number;
  last_purchase_date: string | null;
}

export async function listSuppliers(): Promise<Supplier[]> {
  const { data, error } = await supabase
    .from('suppliers')
    .select('id, name, phone, address, total_purchases, last_purchase_date')
    .order('name');
  if (error) throw error;
  return (data ?? []) as Supplier[];
}

export async function createSupplier(input: { name: string; phone?: string | null; address?: string | null }): Promise<Supplier> {
  const { data, error } = await supabase.from('suppliers').insert({
    name: input.name.trim(),
    phone: input.phone?.trim() || null,
    address: input.address?.trim() || null,
  }).select().single();
  if (error) throw error;
  return data as Supplier;
}

export async function updateSupplier(id: string, input: { name: string; phone?: string | null; address?: string | null }): Promise<void> {
  const { error } = await supabase.from('suppliers').update({
    name: input.name.trim(),
    phone: input.phone?.trim() || null,
    address: input.address?.trim() || null,
  }).eq('id', id);
  if (error) throw error;
}

export async function deleteSupplier(id: string): Promise<void> {
  const { error } = await supabase.from('suppliers').delete().eq('id', id);
  if (error) throw error;
}

export interface SupplierInvoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
  amount_paid: number;
  status: string;
  supplier_id: string | null;
}

export async function listAllPurchaseInvoicesLite(): Promise<SupplierInvoice[]> {
  const { data, error } = await supabase
    .from('purchase_invoices')
    .select('id, invoice_number, invoice_date, total_amount, amount_paid, status, supplier_id')
    .order('invoice_date', { ascending: false });
  if (error) throw error;
  return (data ?? []) as SupplierInvoice[];
}
