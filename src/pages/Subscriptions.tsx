import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, Pencil, Trash2, Calendar, DollarSign, Users } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { formatDZD } from '@/lib/utils';
import { describeError } from '@/lib/supabase';
import { usePermissions } from '@/contexts/AuthContext';
import {
  Subscription, SubscriptionInput, listSubscriptionTypes, createSubscriptionType,
  updateSubscriptionType, deleteSubscriptionType, subscriptionUsage,
} from '@/lib/api/athletes';

export const Subscriptions: React.FC = () => {
  const { can } = usePermissions();
  const [types, setTypes] = useState<Subscription[]>([]);
  const [usage, setUsage] = useState<Record<string, { members: number; revenue: number }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Subscription | null>(null);
  const [form, setForm] = useState({ name: '', duration: '', sessions: '', price: '', open: false });
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<Subscription | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [t, u] = await Promise.all([listSubscriptionTypes(), subscriptionUsage()]);
      setTypes(t);
      setUsage(u);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => {
    const members = Object.values(usage).reduce((s, u) => s + u.members, 0);
    const revenue = Object.values(usage).reduce((s, u) => s + u.revenue, 0);
    return { members, revenue };
  }, [usage]);

  const openNew = () => {
    setEditing(null); setForm({ name: '', duration: '', sessions: '', price: '', open: false });
    setDialogOpen(true);
  };
  const openEdit = (s: Subscription) => {
    setEditing(s);
    setForm({
      name: s.name,
      duration: s.duration === 0 ? '' : String(s.duration),
      sessions: s.sessions ? String(s.sessions) : '',
      price: String(s.price),
      open: s.is_open,
    });
    setDialogOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.price) {
      toast({ title: 'Check the form', description: 'Name and price are required.', variant: 'destructive' });
      return;
    }
    const payload: SubscriptionInput = {
      name: form.name.trim(),
      duration: parseInt(form.duration || '0', 10),
      sessions: form.open ? null : (form.sessions ? parseInt(form.sessions, 10) : null),
      price: parseFloat(form.price),
      is_open: form.open,
    };
    setSaving(true);
    try {
      if (editing) { await updateSubscriptionType(editing.id, payload); toast({ title: 'Subscription updated' }); }
      else { await createSubscriptionType(payload); toast({ title: 'Subscription created' }); }
      setDialogOpen(false);
      await load();
    } catch (err) {
      toast({ title: 'Could not save', description: describeError(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await deleteSubscriptionType(toDelete.id);
      toast({ title: 'Subscription deleted' });
      setToDelete(null);
      await load();
    } catch (e) {
      toast({ title: 'Could not delete', description: describeError(e), variant: 'destructive' });
    }
  };

  return (
    <div className="min-h-screen bg-gym-black text-gym-gold p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold gradient-text">Subscriptions</h1>
            <p className="text-gym-gold/60 mt-1">Your membership plans.</p>
          </div>
          {can('subscriptions', 'create') && (
            <Button onClick={openNew} className="bg-gym-gold text-gym-black hover:bg-gym-gold/90">
              <Plus className="w-4 h-4 mr-2" />New subscription
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-gym-gray border-gym-gold/20"><CardContent className="p-5 flex items-center justify-between">
            <div><p className="text-gym-gold/60 text-sm">Plans</p><p className="text-2xl font-bold text-gym-gold">{types.length}</p></div>
            <Calendar className="w-8 h-8 text-blue-400" />
          </CardContent></Card>
          <Card className="bg-gym-gray border-gym-gold/20"><CardContent className="p-5 flex items-center justify-between">
            <div><p className="text-gym-gold/60 text-sm">Active members</p><p className="text-2xl font-bold text-green-400">{totals.members}</p></div>
            <Users className="w-8 h-8 text-green-400" />
          </CardContent></Card>
          <Card className="bg-gym-gray border-gym-gold/20"><CardContent className="p-5 flex items-center justify-between">
            <div><p className="text-gym-gold/60 text-sm">Revenue</p><p className="text-2xl font-bold text-gym-gold">{formatDZD(totals.revenue)}</p></div>
            <DollarSign className="w-8 h-8 text-gym-gold" />
          </CardContent></Card>
        </div>

        <Card className="bg-gym-gray border-gym-gold/20">
          <CardHeader>
            <CardTitle className="text-gym-gold">Plans</CardTitle>
            <CardDescription className="text-gym-gold/60">Manage your subscription types.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="py-8 text-center text-gym-gold/40">Loading…</p>
            ) : error ? (
              <div className="py-8 text-center space-y-3">
                <p className="text-red-400">{error}</p>
                <Button variant="outline" onClick={load} className="border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10">Try again</Button>
              </div>
            ) : types.length === 0 ? (
              <p className="py-8 text-center text-gym-gold/50">No plans yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-gym-gold/20">
                      <TableHead className="text-gym-gold">Plan</TableHead>
                      <TableHead className="text-gym-gold">Duration</TableHead>
                      <TableHead className="text-gym-gold">Sessions</TableHead>
                      <TableHead className="text-gym-gold">Price</TableHead>
                      <TableHead className="text-gym-gold">Members</TableHead>
                      <TableHead className="text-gym-gold">Revenue</TableHead>
                      <TableHead className="text-gym-gold">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {types.map((s) => {
                      const u = usage[s.id] ?? { members: 0, revenue: 0 };
                      return (
                        <TableRow key={s.id} className="border-gym-gold/10 hover:bg-gym-gold/5">
                          <TableCell className="text-gym-gold font-medium">{s.name}</TableCell>
                          <TableCell className="text-gym-gold">
                            {s.is_open ? 'Open' : `${s.duration} days`}
                          </TableCell>
                          <TableCell className="text-gym-gold">{s.sessions ?? '—'}</TableCell>
                          <TableCell className="text-gym-gold font-semibold">{formatDZD(s.price)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="bg-blue-500/20 text-blue-400 border-blue-500/30">{u.members}</Badge>
                          </TableCell>
                          <TableCell className="text-green-400 font-semibold">{formatDZD(u.revenue)}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {can('subscriptions', 'edit') && (
                                <Button size="icon" variant="ghost" onClick={() => openEdit(s)}
                                        className="h-7 w-7 text-gym-gold hover:bg-gym-gold/10" aria-label="Edit">
                                  <Pencil className="w-4 h-4" />
                                </Button>
                              )}
                              {can('subscriptions', 'delete') && (
                                <Button size="icon" variant="ghost" onClick={() => setToDelete(s)}
                                        className="h-7 w-7 text-red-400 hover:bg-red-500/10" aria-label="Delete">
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-gym-gray border-gym-gold/30 text-gym-gold">
          <DialogHeader>
            <DialogTitle className="gradient-text">{editing ? 'Edit subscription' : 'New subscription'}</DialogTitle>
            <DialogDescription className="text-gym-gold/60">Define a membership plan.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                     className="gym-input" placeholder="Monthly, Quarterly…" />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-gym-gold/20 p-3">
              <div>
                <Label className="cursor-pointer">Open subscription</Label>
                <p className="text-[11px] text-gym-gold/40">No fixed session count</p>
              </div>
              <Switch checked={form.open} onCheckedChange={(v) => setForm({ ...form, open: v })} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Duration (days)</Label>
                <Input type="number" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })}
                       className="gym-input" placeholder="30" />
              </div>
              {!form.open && (
                <div className="space-y-1.5">
                  <Label>Sessions</Label>
                  <Input type="number" value={form.sessions} onChange={(e) => setForm({ ...form, sessions: e.target.value })}
                         className="gym-input" placeholder="12" />
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Price (DZD) *</Label>
              <Input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })}
                     className="gym-input" placeholder="5000" />
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
              <Button type="submit" className="gym-button" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={toDelete !== null} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent className="bg-gym-gray border-gym-gold/20 text-gym-gold">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {toDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription className="text-gym-gold/60">
              Existing athlete subscriptions keep their recorded details; only the plan template is removed.
            </AlertDialogDescription>
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
