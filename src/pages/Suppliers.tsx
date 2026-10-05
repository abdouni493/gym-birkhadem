import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Search, Plus, Pencil, Trash2, Truck, Phone, MapPin, DollarSign, FileText } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { formatDZD } from '@/lib/utils';
import { describeError } from '@/lib/supabase';
import { usePermissions } from '@/contexts/AuthContext';
import {
  Supplier, SupplierInvoice, listSuppliers, createSupplier, updateSupplier, deleteSupplier,
  listAllPurchaseInvoicesLite,
} from '@/lib/api/misc';

export const Suppliers: React.FC = () => {
  const { can } = usePermissions();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [invoices, setInvoices] = useState<SupplierInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', address: '' });
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<Supplier | null>(null);
  const [historySupplier, setHistorySupplier] = useState<Supplier | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, inv] = await Promise.all([listSuppliers(), listAllPurchaseInvoicesLite()]);
      setSuppliers(s);
      setInvoices(inv);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const stats = useCallback((id: string) => {
    const list = invoices.filter((i) => i.supplier_id === id);
    const total = list.reduce((s, i) => s + Number(i.total_amount), 0);
    const paid = list.reduce((s, i) => s + Number(i.amount_paid), 0);
    return { list, total, paid, remaining: total - paid };
  }, [invoices]);

  const grand = useMemo(() => {
    const total = invoices.reduce((s, i) => s + Number(i.total_amount), 0);
    const paid = invoices.reduce((s, i) => s + Number(i.amount_paid), 0);
    return { total, paid, remaining: total - paid };
  }, [invoices]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return suppliers.filter((s) => !q || s.name.toLowerCase().includes(q) || (s.phone ?? '').includes(q));
  }, [suppliers, search]);

  const openCreate = () => { setEditing(null); setForm({ name: '', phone: '', address: '' }); setFormOpen(true); };
  const openEdit = (s: Supplier) => { setEditing(s); setForm({ name: s.name, phone: s.phone ?? '', address: s.address ?? '' }); setFormOpen(true); };

  const save = async () => {
    if (!form.name.trim()) { toast({ title: 'Name required', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      if (editing) { await updateSupplier(editing.id, form); toast({ title: 'Supplier updated' }); }
      else { await createSupplier(form); toast({ title: 'Supplier created' }); }
      setFormOpen(false);
      await load();
    } catch (e) {
      toast({ title: 'Could not save', description: describeError(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await deleteSupplier(toDelete.id);
      toast({ title: 'Supplier deleted' });
      setToDelete(null);
      await load();
    } catch (e) {
      toast({ title: 'Could not delete', description: describeError(e), variant: 'destructive' });
    }
  };

  const badge = (status: string) => {
    if (status === 'paid') return <Badge className="bg-green-500/20 text-green-400 border border-green-500/30">paid</Badge>;
    if (status === 'partial') return <Badge className="bg-orange-500/20 text-orange-400 border border-orange-500/30">partial</Badge>;
    return <Badge className="bg-red-500/20 text-red-400 border border-red-500/30">pending</Badge>;
  };

  const history = historySupplier ? stats(historySupplier.id) : null;

  return (
    <div className="min-h-screen bg-gym-black text-gym-gold p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-wrap justify-between items-center gap-3">
          <div>
            <h1 className="text-3xl font-bold gradient-text">Suppliers</h1>
            <p className="text-gym-gold/60 mt-1">Who you buy stock from.</p>
          </div>
          {can('suppliers', 'create') && (
            <Button onClick={openCreate} className="bg-gym-gold text-gym-black hover:bg-gym-gold/90">
              <Plus className="w-4 h-4 mr-2" />New supplier
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-gym-gray border-gym-gold/20"><CardContent className="p-5 flex items-center justify-between">
            <div><p className="text-gym-gold/60 text-sm">Total purchases</p><p className="text-2xl font-bold text-gym-gold">{formatDZD(grand.total)}</p></div>
            <DollarSign className="w-8 h-8 text-green-400" />
          </CardContent></Card>
          <Card className="bg-gym-gray border-gym-gold/20"><CardContent className="p-5 flex items-center justify-between">
            <div><p className="text-gym-gold/60 text-sm">Paid</p><p className="text-2xl font-bold text-green-400">{formatDZD(grand.paid)}</p></div>
            <DollarSign className="w-8 h-8 text-blue-400" />
          </CardContent></Card>
          <Card className="bg-gym-gray border-gym-gold/20"><CardContent className="p-5 flex items-center justify-between">
            <div><p className="text-gym-gold/60 text-sm">Remaining</p><p className="text-2xl font-bold text-red-400">{formatDZD(grand.remaining)}</p></div>
            <Truck className="w-8 h-8 text-orange-400" />
          </CardContent></Card>
        </div>

        <Card className="bg-gym-gray border-gym-gold/20">
          <CardContent className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gym-gold/50 w-4 h-4" />
              <Input placeholder="Search by name or phone…" value={search} onChange={(e) => setSearch(e.target.value)}
                     className="pl-10 bg-gym-black border-gym-gold/30 text-gym-gold" />
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <Card className="bg-gym-gray border-gym-gold/20"><CardContent className="p-12 text-center text-gym-gold/40">Loading…</CardContent></Card>
        ) : error ? (
          <Card className="bg-gym-gray border-red-500/30">
            <CardContent className="p-8 text-center space-y-3">
              <p className="text-red-400 font-medium">Could not load suppliers</p>
              <p className="text-sm text-gym-gold/50">{error}</p>
              <Button variant="outline" onClick={load} className="border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10">Try again</Button>
            </CardContent>
          </Card>
        ) : filtered.length === 0 ? (
          <Card className="bg-gym-gray border-gym-gold/20">
            <CardContent className="p-12 text-center">
              <Truck className="w-12 h-12 mx-auto mb-3 text-gym-gold/20" />
              <p className="text-gym-gold/60">No suppliers found.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((s) => {
              const st = stats(s.id);
              return (
                <Card key={s.id} className="bg-gym-gray border-gym-gold/20 hover:border-gym-gold/40 transition-colors">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-gym-gold">{s.name}</CardTitle>
                    <CardDescription className="text-gym-gold/60 text-xs space-y-1">
                      {s.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{s.phone}</span>}
                      {s.address && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{s.address}</span>}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-3 gap-1 text-center text-xs">
                      <div className="bg-gym-gold/5 rounded p-2"><p className="text-gym-gold/60">Total</p><p className="text-gym-gold font-semibold">{formatDZD(st.total)}</p></div>
                      <div className="bg-gym-gold/5 rounded p-2"><p className="text-gym-gold/60">Paid</p><p className="text-green-400 font-semibold">{formatDZD(st.paid)}</p></div>
                      <div className="bg-gym-gold/5 rounded p-2"><p className="text-gym-gold/60">Left</p><p className="text-red-400 font-semibold">{formatDZD(st.remaining)}</p></div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setHistorySupplier(s)}
                              className="flex-1 border-gym-gold/30 text-blue-400 hover:bg-blue-500/10"><FileText className="w-4 h-4" /></Button>
                      {can('suppliers', 'edit') && (
                        <Button size="sm" variant="outline" onClick={() => openEdit(s)}
                                className="flex-1 border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10"><Pencil className="w-4 h-4" /></Button>
                      )}
                      {can('suppliers', 'delete') && (
                        <Button size="sm" variant="outline" onClick={() => setToDelete(s)}
                                className="flex-1 border-gym-gold/30 text-red-400 hover:bg-red-500/10"><Trash2 className="w-4 h-4" /></Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md bg-gym-gray border-gym-gold/30 text-gym-gold">
          <DialogHeader>
            <DialogTitle className="gradient-text">{editing ? 'Edit supplier' : 'New supplier'}</DialogTitle>
            <DialogDescription className="text-gym-gold/60">Supplier information.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="gym-input mt-1" /></div>
            <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="gym-input mt-1" /></div>
            <div><Label>Address</Label><Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="gym-input mt-1" rows={2} /></div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setFormOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={save} className="gym-button" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!historySupplier} onOpenChange={(o) => !o && setHistorySupplier(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-gym-gray border-gym-gold/30 text-gym-gold">
          <DialogHeader><DialogTitle className="gradient-text">Purchases — {historySupplier?.name}</DialogTitle></DialogHeader>
          {history && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                <div className="bg-gym-gold/5 rounded p-3"><p className="text-gym-gold/60 text-xs">Total</p><p className="font-semibold">{formatDZD(history.total)}</p></div>
                <div className="bg-gym-gold/5 rounded p-3"><p className="text-gym-gold/60 text-xs">Paid</p><p className="text-green-400 font-semibold">{formatDZD(history.paid)}</p></div>
                <div className="bg-gym-gold/5 rounded p-3"><p className="text-gym-gold/60 text-xs">Remaining</p><p className="text-red-400 font-semibold">{formatDZD(history.remaining)}</p></div>
              </div>
              {history.list.length === 0 ? (
                <p className="text-gym-gold/50 text-center py-6">No purchases yet.</p>
              ) : (
                <div className="overflow-x-auto border border-gym-gold/15 rounded-lg">
                  <Table>
                    <TableHeader><TableRow className="border-gym-gold/20">
                      <TableHead className="text-gym-gold">Invoice</TableHead>
                      <TableHead className="text-gym-gold">Date</TableHead>
                      <TableHead className="text-gym-gold text-right">Total</TableHead>
                      <TableHead className="text-gym-gold text-right">Paid</TableHead>
                      <TableHead className="text-gym-gold text-right">Remaining</TableHead>
                      <TableHead className="text-gym-gold">Status</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {history.list.map((inv) => (
                        <TableRow key={inv.id} className="border-gym-gold/10">
                          <TableCell className="text-gym-gold font-mono">{inv.invoice_number}</TableCell>
                          <TableCell className="text-gym-gold">{inv.invoice_date}</TableCell>
                          <TableCell className="text-gym-gold text-right">{formatDZD(inv.total_amount)}</TableCell>
                          <TableCell className="text-green-400 text-right">{formatDZD(inv.amount_paid)}</TableCell>
                          <TableCell className="text-red-400 text-right">{formatDZD(inv.total_amount - inv.amount_paid)}</TableCell>
                          <TableCell>{badge(inv.status)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={toDelete !== null} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent className="bg-gym-gray border-gym-gold/20 text-gym-gold">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {toDelete?.name}?</AlertDialogTitle>
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
