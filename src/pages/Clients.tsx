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
import { Search, Plus, Pencil, Trash2, History, Users, Phone, MapPin } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { formatDZD } from '@/lib/utils';
import { describeError } from '@/lib/supabase';
import { usePermissions } from '@/contexts/AuthContext';
import {
  Client, ClientInvoice, listClients, createClient, updateClient, deleteClient, listClientInvoices,
} from '@/lib/api/misc';

export const Clients: React.FC = () => {
  const { can } = usePermissions();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', address: '' });
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<Client | null>(null);

  const [historyClient, setHistoryClient] = useState<Client | null>(null);
  const [historyRows, setHistoryRows] = useState<ClientInvoice[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setClients(await listClients());
    } catch (e) {
      setError(describeError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients.filter((c) => !q || c.name.toLowerCase().includes(q) || (c.phone ?? '').includes(q));
  }, [clients, search]);

  const openCreate = () => { setEditing(null); setForm({ name: '', phone: '', address: '' }); setFormOpen(true); };
  const openEdit = (c: Client) => { setEditing(c); setForm({ name: c.name, phone: c.phone ?? '', address: c.address ?? '' }); setFormOpen(true); };

  const save = async () => {
    if (!form.name.trim()) { toast({ title: 'Name required', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      if (editing) { await updateClient(editing.id, form); toast({ title: 'Client updated' }); }
      else { await createClient(form); toast({ title: 'Client created' }); }
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
      await deleteClient(toDelete.id);
      toast({ title: 'Client deleted' });
      setToDelete(null);
      await load();
    } catch (e) {
      toast({ title: 'Could not delete', description: describeError(e), variant: 'destructive' });
    }
  };

  const openHistory = async (c: Client) => {
    setHistoryClient(c);
    try {
      setHistoryRows(await listClientInvoices(c.id));
    } catch (e) {
      toast({ title: 'Could not load history', description: describeError(e), variant: 'destructive' });
    }
  };

  const histStats = useMemo(() => {
    const total = historyRows.reduce((s, i) => s + Number(i.total_amount), 0);
    const paid = historyRows.reduce((s, i) => s + Number(i.amount_paid), 0);
    return { total, paid, remaining: total - paid };
  }, [historyRows]);

  return (
    <div className="min-h-screen bg-gym-black text-gym-gold p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-wrap justify-between items-center gap-3">
          <div>
            <h1 className="text-3xl font-bold gradient-text">Clients</h1>
            <p className="text-gym-gold/60 mt-1">Your retail customers.</p>
          </div>
          {can('clients', 'create') && (
            <Button onClick={openCreate} className="bg-gym-gold text-gym-black hover:bg-gym-gold/90">
              <Plus className="w-4 h-4 mr-2" />New client
            </Button>
          )}
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
              <p className="text-red-400 font-medium">Could not load clients</p>
              <p className="text-sm text-gym-gold/50">{error}</p>
              <Button variant="outline" onClick={load} className="border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10">Try again</Button>
            </CardContent>
          </Card>
        ) : filtered.length === 0 ? (
          <Card className="bg-gym-gray border-gym-gold/20">
            <CardContent className="p-12 text-center">
              <Users className="w-12 h-12 mx-auto mb-3 text-gym-gold/20" />
              <p className="text-gym-gold/60">No clients found.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((c) => (
              <Card key={c.id} className="bg-gym-gray border-gym-gold/20 hover:border-gym-gold/40 transition-colors">
                <CardHeader className="pb-3">
                  <CardTitle className="text-gym-gold">{c.name}</CardTitle>
                  <CardDescription className="text-gym-gold/60 text-xs space-y-1">
                    {c.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</span>}
                    {c.address && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{c.address}</span>}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => openHistory(c)}
                            className="flex-1 border-gym-gold/30 text-blue-400 hover:bg-blue-500/10">
                      <History className="w-4 h-4" />
                    </Button>
                    {can('clients', 'edit') && (
                      <Button size="sm" variant="outline" onClick={() => openEdit(c)}
                              className="flex-1 border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10">
                        <Pencil className="w-4 h-4" />
                      </Button>
                    )}
                    {can('clients', 'delete') && (
                      <Button size="sm" variant="outline" onClick={() => setToDelete(c)}
                              className="flex-1 border-gym-gold/30 text-red-400 hover:bg-red-500/10">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create / edit */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md bg-gym-gray border-gym-gold/30 text-gym-gold">
          <DialogHeader>
            <DialogTitle className="gradient-text">{editing ? 'Edit client' : 'New client'}</DialogTitle>
            <DialogDescription className="text-gym-gold/60">Client information.</DialogDescription>
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

      {/* History */}
      <Dialog open={!!historyClient} onOpenChange={(o) => !o && setHistoryClient(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-gym-gray border-gym-gold/30 text-gym-gold">
          <DialogHeader>
            <DialogTitle className="gradient-text">History — {historyClient?.name}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="bg-gym-gold/5 rounded p-3"><p className="text-gym-gold/60 text-xs">Total</p><p className="font-semibold">{formatDZD(histStats.total)}</p></div>
            <div className="bg-gym-gold/5 rounded p-3"><p className="text-gym-gold/60 text-xs">Paid</p><p className="text-green-400 font-semibold">{formatDZD(histStats.paid)}</p></div>
            <div className="bg-gym-gold/5 rounded p-3"><p className="text-gym-gold/60 text-xs">Remaining</p><p className="text-red-400 font-semibold">{formatDZD(histStats.remaining)}</p></div>
          </div>
          {historyRows.length === 0 ? (
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
                  {historyRows.map((inv) => (
                    <TableRow key={inv.id} className="border-gym-gold/10">
                      <TableCell className="text-gym-gold font-mono">{inv.invoice_number}</TableCell>
                      <TableCell className="text-gym-gold">{inv.creation_date}</TableCell>
                      <TableCell className="text-gym-gold text-right">{formatDZD(inv.total_amount)}</TableCell>
                      <TableCell className="text-green-400 text-right">{formatDZD(inv.amount_paid)}</TableCell>
                      <TableCell className="text-red-400 text-right">{formatDZD(inv.total_amount - inv.amount_paid)}</TableCell>
                      <TableCell>
                        <Badge className={inv.status === 'paid'
                          ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                          : 'bg-red-500/20 text-red-400 border border-red-500/30'}>
                          {inv.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
