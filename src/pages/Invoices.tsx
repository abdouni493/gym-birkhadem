import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Search, Eye, Pencil, Trash2, DollarSign, Receipt, TrendingUp, Calendar } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { formatDZD } from '@/lib/utils';
import { describeError } from '@/lib/supabase';
import { usePermissions } from '@/contexts/AuthContext';
import { Client, listClients } from '@/lib/api/misc';
import {
  SalesInvoice, SalesInvoiceItem, listSalesInvoices, payInvoice, updateInvoice, deleteInvoice,
} from '@/lib/api/sales';
import { ViewToggle, ViewMode } from '@/components/common/ViewToggle';

type DateFilter = 'all' | 'today' | 'week' | 'month' | 'period';

export const Invoices: React.FC = () => {
  const { can } = usePermissions();
  const [invoices, setInvoices] = useState<SalesInvoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('cards');

  const [detailsInvoice, setDetailsInvoice] = useState<SalesInvoice | null>(null);
  const [payTarget, setPayTarget] = useState<SalesInvoice | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [toDelete, setToDelete] = useState<SalesInvoice | null>(null);

  const [editInvoice, setEditInvoice] = useState<SalesInvoice | null>(null);
  const [editItems, setEditItems] = useState<SalesInvoiceItem[]>([]);
  const [editClientId, setEditClientId] = useState('passage');
  const [editDiscount, setEditDiscount] = useState('');
  const [editPaid, setEditPaid] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [inv, cli] = await Promise.all([listSalesInvoices(), listClients()]);
      setInvoices(inv);
      setClients(cli);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const matchesDate = useCallback((dateStr: string): boolean => {
    if (dateFilter === 'all') return true;
    const d = new Date(dateStr);
    const now = new Date();
    if (dateFilter === 'today') return dateStr === now.toISOString().split('T')[0];
    if (dateFilter === 'week') { const w = new Date(now); w.setDate(now.getDate() - 7); return d >= w; }
    if (dateFilter === 'month') { const m = new Date(now); m.setMonth(now.getMonth() - 1); return d >= m; }
    if (dateFilter === 'period') {
      if (periodStart && d < new Date(periodStart)) return false;
      if (periodEnd && d > new Date(periodEnd)) return false;
      return true;
    }
    return true;
  }, [dateFilter, periodStart, periodEnd]);

  const filtered = useMemo(() => invoices.filter((inv) => {
    const q = search.toLowerCase();
    const matchesSearch = !q || inv.customer_name.toLowerCase().includes(q) || (inv.client_phone ?? '').includes(q);
    return matchesSearch && matchesDate(inv.creation_date);
  }), [invoices, search, matchesDate]);

  const totalRevenue = useMemo(() => invoices.reduce((s, i) => s + i.amount_paid, 0), [invoices]);
  const unpaid = useMemo(() => invoices.reduce((s, i) => s + (i.total_amount - i.amount_paid), 0), [invoices]);

  const statusBadge = (status: SalesInvoice['status']) => status === 'paid'
    ? <Badge className="bg-green-500/20 text-green-400 border border-green-500/30">paid</Badge>
    : <Badge className="bg-red-500/20 text-red-400 border border-red-500/30">debt</Badge>;

  const doPay = async () => {
    if (!payTarget) return;
    const amount = Number(payAmount) || 0;
    if (amount <= 0) { toast({ title: 'Invalid amount', variant: 'destructive' }); return; }
    try {
      await payInvoice(payTarget, amount);
      toast({ title: 'Payment recorded' });
      setPayTarget(null); setPayAmount('');
      await load();
    } catch (e) {
      toast({ title: 'Could not record payment', description: describeError(e), variant: 'destructive' });
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await deleteInvoice(toDelete.id);
      toast({ title: 'Invoice deleted' });
      setToDelete(null);
      await load();
    } catch (e) {
      toast({ title: 'Could not delete', description: describeError(e), variant: 'destructive' });
    }
  };

  const openEdit = (inv: SalesInvoice) => {
    setEditInvoice(inv);
    setEditItems((inv.sales_invoice_items ?? []).map((it) => ({ ...it })));
    setEditClientId(inv.client_id || 'passage');
    setEditDiscount(String(inv.discount || 0));
    setEditPaid(String(inv.amount_paid || 0));
  };

  const editSubtotal = editItems.reduce((s, it) => s + it.unit_price * it.quantity, 0);
  const editTotal = Math.max(0, editSubtotal - (Number(editDiscount) || 0));

  const updateEditItem = (id: string, field: 'quantity' | 'unit_price', value: string) => {
    setEditItems((prev) => prev.map((it) => it.id === id ? { ...it, [field]: Number(value) || 0 } : it));
  };

  const saveEdit = async () => {
    if (!editInvoice) return;
    const client = clients.find((c) => c.id === editClientId);
    try {
      await updateInvoice(editInvoice.id, {
        client_id: editClientId === 'passage' ? null : editClientId,
        customer_name: editClientId === 'passage' ? 'Client de passage' : (client?.name || editInvoice.customer_name),
        client_phone: editClientId === 'passage' ? null : (client?.phone ?? null),
        subtotal: editSubtotal,
        discount: Number(editDiscount) || 0,
        total_amount: editTotal,
        amount_paid: Number(editPaid) || 0,
        items: editItems.map((it) => ({ id: it.id, quantity: it.quantity, unit_price: it.unit_price })),
      });
      toast({ title: 'Invoice updated' });
      setEditInvoice(null);
      await load();
    } catch (e) {
      toast({ title: 'Could not update', description: describeError(e), variant: 'destructive' });
    }
  };

  const actions = (inv: SalesInvoice) => {
    const remaining = inv.total_amount - inv.amount_paid;
    return (
      <div className="flex gap-1 flex-wrap">
        <Button size="sm" variant="ghost" onClick={() => setDetailsInvoice(inv)} className="text-blue-400 hover:bg-blue-500/10" title="View"><Eye className="w-4 h-4" /></Button>
        {can('invoices', 'edit') && <Button size="sm" variant="ghost" onClick={() => openEdit(inv)} className="text-gym-gold hover:bg-gym-gold/10" title="Edit"><Pencil className="w-4 h-4" /></Button>}
        {remaining > 0 && can('invoices', 'edit') && <Button size="sm" variant="ghost" onClick={() => { setPayTarget(inv); setPayAmount(String(remaining)); }} className="text-green-400 hover:bg-green-500/10" title="Pay debt"><DollarSign className="w-4 h-4" /></Button>}
        {can('invoices', 'delete') && <Button size="sm" variant="ghost" onClick={() => setToDelete(inv)} className="text-red-400 hover:bg-red-500/10" title="Delete"><Trash2 className="w-4 h-4" /></Button>}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gym-black text-gym-gold p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold gradient-text">Sales</h1>
          <p className="text-gym-gold/60 mt-1">Sales invoices and debts.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-gym-gray border-gym-gold/20"><CardContent className="p-5 flex items-center justify-between">
            <div><p className="text-gym-gold/60 text-sm">Invoices</p><p className="text-2xl font-bold text-gym-gold">{invoices.length}</p></div>
            <Receipt className="w-8 h-8 text-blue-400" />
          </CardContent></Card>
          <Card className="bg-gym-gray border-gym-gold/20"><CardContent className="p-5 flex items-center justify-between">
            <div><p className="text-gym-gold/60 text-sm">Revenue</p><p className="text-2xl font-bold text-green-400">{formatDZD(totalRevenue)}</p></div>
            <TrendingUp className="w-8 h-8 text-green-400" />
          </CardContent></Card>
          <Card className="bg-gym-gray border-gym-gold/20"><CardContent className="p-5 flex items-center justify-between">
            <div><p className="text-gym-gold/60 text-sm">Unpaid</p><p className="text-2xl font-bold text-red-400">{formatDZD(unpaid)}</p></div>
            <Calendar className="w-8 h-8 text-orange-400" />
          </CardContent></Card>
        </div>

        <Card className="bg-gym-gray border-gym-gold/20">
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-col lg:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gym-gold/50 w-4 h-4" />
                <Input placeholder="Search customer…" value={search} onChange={(e) => setSearch(e.target.value)}
                       className="pl-10 bg-gym-black border-gym-gold/30 text-gym-gold" />
              </div>
              <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as DateFilter)}>
                <SelectTrigger className="w-full lg:w-44 bg-gym-black border-gym-gold/30 text-gym-gold"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-gym-gray border-gym-gold/30 text-gym-gold">
                  <SelectItem value="all">All dates</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">Last week</SelectItem>
                  <SelectItem value="month">Last month</SelectItem>
                  <SelectItem value="period">Period</SelectItem>
                </SelectContent>
              </Select>
              <ViewToggle mode={viewMode} onChange={setViewMode} cardsLabel="Cards" tableLabel="Table" />
            </div>
            {dateFilter === 'period' && (
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1"><Label className="text-xs">Start</Label><Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="bg-gym-black border-gym-gold/30 text-gym-gold mt-1" /></div>
                <div className="flex-1"><Label className="text-xs">End</Label><Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="bg-gym-black border-gym-gold/30 text-gym-gold mt-1" /></div>
              </div>
            )}
          </CardContent>
        </Card>

        {loading ? (
          <Card className="bg-gym-gray border-gym-gold/20"><CardContent className="p-12 text-center text-gym-gold/40">Loading…</CardContent></Card>
        ) : error ? (
          <Card className="bg-gym-gray border-red-500/30">
            <CardContent className="p-8 text-center space-y-3">
              <p className="text-red-400 font-medium">Could not load invoices</p>
              <p className="text-sm text-gym-gold/50">{error}</p>
              <Button variant="outline" onClick={load} className="border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10">Try again</Button>
            </CardContent>
          </Card>
        ) : filtered.length === 0 ? (
          <Card className="bg-gym-gray border-gym-gold/20"><CardContent className="p-12 text-center">
            <Receipt className="w-12 h-12 mx-auto mb-3 text-gym-gold/20" />
            <p className="text-gym-gold/60">No invoices found.</p>
          </CardContent></Card>
        ) : viewMode === 'cards' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((inv) => {
              const remaining = inv.total_amount - inv.amount_paid;
              return (
                <Card key={inv.id} className="bg-gym-gray border-gym-gold/20 hover:border-gym-gold/40 transition-colors">
                  <CardHeader className="pb-3"><div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-gym-gold text-base font-mono">{inv.invoice_number}</CardTitle>
                      <CardDescription className="text-gym-gold/60 text-xs">{inv.customer_name} • {inv.creation_date}</CardDescription>
                    </div>
                    {statusBadge(inv.status)}
                  </div></CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-gym-gold/60 text-xs">{(inv.sales_invoice_items ?? []).length} items</p>
                    <div className="flex justify-between text-sm"><span className="text-gym-gold/60">Total</span><span className="text-gym-gold font-semibold">{formatDZD(inv.total_amount)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-gym-gold/60">Paid</span><span className="text-green-400">{formatDZD(inv.amount_paid)}</span></div>
                    {remaining > 0 && <div className="flex justify-between text-sm"><span className="text-gym-gold/60">Remaining</span><span className="text-red-400">{formatDZD(remaining)}</span></div>}
                    <div className="pt-2 border-t border-gym-gold/10">{actions(inv)}</div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="bg-gym-gray border-gym-gold/20"><CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow className="border-gym-gold/20 hover:bg-gym-gold/5">
                <TableHead className="text-gym-gold">Invoice</TableHead>
                <TableHead className="text-gym-gold">Customer</TableHead>
                <TableHead className="text-gym-gold">Date</TableHead>
                <TableHead className="text-gym-gold text-right">Total</TableHead>
                <TableHead className="text-gym-gold text-right">Remaining</TableHead>
                <TableHead className="text-gym-gold">Status</TableHead>
                <TableHead className="text-gym-gold">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.map((inv) => (
                  <TableRow key={inv.id} className="border-gym-gold/10 hover:bg-gym-gold/5">
                    <TableCell className="text-gym-gold font-mono">{inv.invoice_number}</TableCell>
                    <TableCell className="text-gym-gold">{inv.customer_name}</TableCell>
                    <TableCell className="text-gym-gold">{inv.creation_date}</TableCell>
                    <TableCell className="text-gym-gold text-right">{formatDZD(inv.total_amount)}</TableCell>
                    <TableCell className="text-right text-red-400">{formatDZD(inv.total_amount - inv.amount_paid)}</TableCell>
                    <TableCell>{statusBadge(inv.status)}</TableCell>
                    <TableCell>{actions(inv)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        )}
      </div>

      {/* Details */}
      <Dialog open={!!detailsInvoice} onOpenChange={(o) => !o && setDetailsInvoice(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-gym-gray border-gym-gold/30 text-gym-gold">
          <DialogHeader><DialogTitle className="gradient-text">Invoice details</DialogTitle></DialogHeader>
          {detailsInvoice && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-gym-gold/60 text-xs">Invoice</p><p className="font-mono font-semibold">{detailsInvoice.invoice_number}</p></div>
                <div><p className="text-gym-gold/60 text-xs">Date</p><p>{detailsInvoice.creation_date}</p></div>
                <div><p className="text-gym-gold/60 text-xs">Customer</p><p>{detailsInvoice.customer_name}{detailsInvoice.client_phone ? ` • ${detailsInvoice.client_phone}` : ''}</p></div>
                <div><p className="text-gym-gold/60 text-xs">Status</p><div className="mt-1">{statusBadge(detailsInvoice.status)}</div></div>
              </div>
              <div className="overflow-x-auto border border-gym-gold/15 rounded-lg">
                <Table>
                  <TableHeader><TableRow className="border-gym-gold/20">
                    <TableHead className="text-gym-gold">Product</TableHead>
                    <TableHead className="text-gym-gold text-right">Qty</TableHead>
                    <TableHead className="text-gym-gold text-right">Unit</TableHead>
                    <TableHead className="text-gym-gold text-right">Total</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {(detailsInvoice.sales_invoice_items ?? []).map((it) => (
                      <TableRow key={it.id} className="border-gym-gold/10">
                        <TableCell className="text-gym-gold">{it.name}</TableCell>
                        <TableCell className="text-gym-gold text-right">{it.quantity}</TableCell>
                        <TableCell className="text-gym-gold text-right">{formatDZD(it.unit_price)}</TableCell>
                        <TableCell className="text-gym-gold text-right font-semibold">{formatDZD(it.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="p-4 bg-gym-gold/10 rounded-lg border border-gym-gold/20 space-y-1">
                <div className="flex justify-between text-gym-gold/80"><span>Subtotal</span><span>{formatDZD(detailsInvoice.subtotal)}</span></div>
                {detailsInvoice.discount > 0 && <div className="flex justify-between text-gym-gold/80"><span>Discount</span><span>- {formatDZD(detailsInvoice.discount)}</span></div>}
                <div className="flex justify-between text-gym-gold font-bold"><span>Total</span><span>{formatDZD(detailsInvoice.total_amount)}</span></div>
                <div className="flex justify-between text-green-400"><span>Paid</span><span>{formatDZD(detailsInvoice.amount_paid)}</span></div>
                <div className="flex justify-between text-red-400"><span>Remaining</span><span>{formatDZD(detailsInvoice.total_amount - detailsInvoice.amount_paid)}</span></div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit */}
      <Dialog open={!!editInvoice} onOpenChange={(o) => !o && setEditInvoice(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-gym-gray border-gym-gold/30 text-gym-gold">
          <DialogHeader><DialogTitle className="gradient-text">Edit invoice</DialogTitle></DialogHeader>
          {editInvoice && (
            <div className="space-y-4">
              <div>
                <Label>Client</Label>
                <Select value={editClientId} onValueChange={setEditClientId}>
                  <SelectTrigger className="bg-gym-black border-gym-gold/30 text-gym-gold mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-gym-gray border-gym-gold/30 text-gym-gold">
                    <SelectItem value="passage">Client de passage</SelectItem>
                    {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="overflow-x-auto border border-gym-gold/15 rounded-lg">
                <Table>
                  <TableHeader><TableRow className="border-gym-gold/20">
                    <TableHead className="text-gym-gold">Product</TableHead>
                    <TableHead className="text-gym-gold w-24">Qty</TableHead>
                    <TableHead className="text-gym-gold w-28">Unit</TableHead>
                    <TableHead className="text-gym-gold text-right">Total</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {editItems.map((it) => (
                      <TableRow key={it.id} className="border-gym-gold/10">
                        <TableCell className="text-gym-gold">{it.name}</TableCell>
                        <TableCell><Input type="number" min="1" value={it.quantity} onChange={(e) => updateEditItem(it.id, 'quantity', e.target.value)} className="bg-gym-black border-gym-gold/30 text-gym-gold h-8 w-20" /></TableCell>
                        <TableCell><Input type="number" min="0" step="0.01" value={it.unit_price} onChange={(e) => updateEditItem(it.id, 'unit_price', e.target.value)} className="bg-gym-black border-gym-gold/30 text-gym-gold h-8 w-24" /></TableCell>
                        <TableCell className="text-gym-gold text-right font-semibold">{formatDZD(it.unit_price * it.quantity)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Discount</Label><Input type="number" min="0" step="0.01" value={editDiscount} onChange={(e) => setEditDiscount(e.target.value)} className="bg-gym-black border-gym-gold/30 text-gym-gold mt-1" /></div>
                <div><Label>Paid</Label><Input type="number" min="0" step="0.01" value={editPaid} onChange={(e) => setEditPaid(e.target.value)} className="bg-gym-black border-gym-gold/30 text-gym-gold mt-1" /></div>
              </div>
              <div className="p-3 bg-gym-gold/10 rounded-lg border border-gym-gold/20 space-y-1 text-sm">
                <div className="flex justify-between text-gym-gold font-bold"><span>Total</span><span>{formatDZD(editTotal)}</span></div>
                <div className="flex justify-between text-red-400"><span>Remaining</span><span>{formatDZD(Math.max(0, editTotal - (Number(editPaid) || 0)))}</span></div>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setEditInvoice(null)}>Cancel</Button>
            <Button onClick={saveEdit} className="gym-button">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pay */}
      <Dialog open={!!payTarget} onOpenChange={(o) => { if (!o) { setPayTarget(null); setPayAmount(''); } }}>
        <DialogContent className="max-w-md bg-gym-gray border-gym-gold/30 text-gym-gold">
          <DialogHeader><DialogTitle className="gradient-text">Pay debt</DialogTitle></DialogHeader>
          {payTarget && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                <div className="bg-gym-gold/5 rounded p-3"><p className="text-gym-gold/60 text-xs">Total</p><p className="font-semibold">{formatDZD(payTarget.total_amount)}</p></div>
                <div className="bg-gym-gold/5 rounded p-3"><p className="text-gym-gold/60 text-xs">Paid</p><p className="text-green-400 font-semibold">{formatDZD(payTarget.amount_paid)}</p></div>
                <div className="bg-gym-gold/5 rounded p-3"><p className="text-gym-gold/60 text-xs">Remaining</p><p className="text-red-400 font-semibold">{formatDZD(payTarget.total_amount - payTarget.amount_paid)}</p></div>
              </div>
              <div>
                <Label>This payment</Label>
                <Input type="number" min="0" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className="bg-gym-black border-gym-gold/30 text-gym-gold mt-1" />
              </div>
              <DialogFooter className="gap-2">
                <Button variant="ghost" onClick={() => { setPayTarget(null); setPayAmount(''); }}>Cancel</Button>
                <Button onClick={doPay} className="gym-button"><DollarSign className="w-4 h-4 mr-2" />Save payment</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={toDelete !== null} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent className="bg-gym-gray border-gym-gold/20 text-gym-gold">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {toDelete?.invoice_number}?</AlertDialogTitle>
            <AlertDialogDescription className="text-gym-gold/60">This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 text-white hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
