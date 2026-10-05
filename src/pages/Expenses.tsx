import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Trash2, Pencil, Plus, TrendingDown } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { formatDZD } from '@/lib/utils';
import { describeError } from '@/lib/supabase';
import { usePermissions } from '@/contexts/AuthContext';
import { Expense, listExpenses, createExpense, updateExpense, deleteExpense } from '@/lib/api/misc';

const today = () => new Date().toISOString().split('T')[0];

export const Expenses: React.FC = () => {
  const { can } = usePermissions();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<Expense | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setExpenses(await listExpenses());
    } catch (e) {
      setError(describeError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const total = useMemo(() => expenses.reduce((s, e) => s + Number(e.amount), 0), [expenses]);

  const openNew = () => {
    setEditing(null); setName(''); setAmount(''); setDate(today()); setNotes('');
    setDialogOpen(true);
  };
  const openEdit = (e: Expense) => {
    setEditing(e); setName(e.name); setAmount(String(e.amount));
    setDate(e.expense_date); setNotes(e.notes ?? '');
    setDialogOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(amount);
    if (!name.trim() || !value || value < 0) {
      toast({ title: 'Check the form', description: 'A name and a valid amount are required.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = { name, amount: value, expense_date: date, notes: notes || null };
      if (editing) await updateExpense(editing.id, payload);
      else await createExpense(payload);
      toast({ title: editing ? 'Expense updated' : 'Expense added', description: formatDZD(value) });
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
      await deleteExpense(toDelete.id);
      toast({ title: 'Expense deleted' });
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
            <h1 className="text-3xl font-bold gradient-text">Expenses</h1>
            <p className="text-gym-gold/60 mt-1">Track what the gym spends.</p>
          </div>
          {can('expenses', 'create') && (
            <Button onClick={openNew} className="bg-gym-gold text-gym-black hover:bg-gym-gold/90">
              <Plus className="w-4 h-4 mr-2" />New expense
            </Button>
          )}
        </div>

        <Card className="bg-gym-gray border-gym-gold/20">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-red-500/15 flex items-center justify-center text-red-400 shrink-0">
              <TrendingDown className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs text-gym-gold/50">Total spent</p>
              <p className="text-2xl font-bold text-gym-gold">{formatDZD(total)}</p>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <Card className="bg-gym-gray border-gym-gold/20"><CardContent className="p-12 text-center text-gym-gold/40">Loading…</CardContent></Card>
        ) : error ? (
          <Card className="bg-gym-gray border-red-500/30">
            <CardContent className="p-8 text-center space-y-3">
              <p className="text-red-400 font-medium">Could not load expenses</p>
              <p className="text-sm text-gym-gold/50">{error}</p>
              <Button variant="outline" onClick={load} className="border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10">Try again</Button>
            </CardContent>
          </Card>
        ) : expenses.length === 0 ? (
          <Card className="bg-gym-gray border-gym-gold/20"><CardContent className="p-12 text-center text-gym-gold/60">No expenses recorded.</CardContent></Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {expenses.map((exp) => (
              <Card key={exp.id} className="bg-gym-gray border-gym-gold/20">
                <CardContent className="p-4 flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gym-gold truncate">{exp.name}</h3>
                    <p className="text-xs text-gym-gold/50">{exp.expense_date}</p>
                    {exp.notes && <p className="text-xs text-gym-gold/60 mt-1 break-words">{exp.notes}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-semibold text-red-400">{formatDZD(exp.amount)}</div>
                    <div className="flex gap-1 mt-2 justify-end">
                      {can('expenses', 'edit') && (
                        <Button size="icon" variant="ghost" onClick={() => openEdit(exp)}
                                className="h-7 w-7 text-gym-gold/70 hover:bg-gym-gold/10" aria-label="Edit">
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {can('expenses', 'delete') && (
                        <Button size="icon" variant="ghost" onClick={() => setToDelete(exp)}
                                className="h-7 w-7 text-red-400 hover:bg-red-500/10" aria-label="Delete">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-gym-gray border-gym-gold/20 text-gym-gold max-w-md">
          <DialogHeader><DialogTitle className="gradient-text">{editing ? 'Edit expense' : 'New expense'}</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="gym-input" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Amount (DZD) *</Label>
                <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="gym-input" />
              </div>
              <div className="space-y-1.5">
                <Label>Date *</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="gym-input" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="gym-input min-h-[60px]" />
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
            <AlertDialogTitle>Delete this expense?</AlertDialogTitle>
            <AlertDialogDescription className="text-gym-gold/60">{toDelete?.name} — {formatDZD(toDelete?.amount ?? 0)}</AlertDialogDescription>
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
