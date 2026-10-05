import React, { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { HandCoins, Plus, Trash2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { formatDZD } from '@/lib/utils';
import { describeError } from '@/lib/supabase';
import { Worker, listAcomptes, addAcompte, deleteAcompte } from '@/lib/api/workers';
import type { AcompteRow } from '@/lib/workerPay';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  worker: Worker | null;
  onChanged?: () => void;
  canDelete?: boolean;
}

const today = () => new Date().toISOString().split('T')[0];

/** Salary advances. Unsettled ones are deducted by the next payment. */
export const AcompteDialog: React.FC<Props> = ({ isOpen, onClose, worker, onChanged, canDelete = true }) => {
  const [rows, setRows] = useState<AcompteRow[]>([]);
  const [date, setDate] = useState(today());
  const [amount, setAmount] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!worker) return;
    setLoading(true);
    try {
      setRows(await listAcomptes(worker.id));
    } catch (e) {
      toast({ title: 'Could not load advances', description: describeError(e), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && worker) {
      load();
      setDate(today()); setAmount(''); setDesc('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, worker]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(amount);
    if (!value || value <= 0) {
      toast({ title: 'Enter an amount', description: 'The advance must be greater than zero.', variant: 'destructive' });
      return;
    }
    if (!worker) return;

    setBusy(true);
    try {
      await addAcompte(worker.id, { acompte_date: date, description: desc || null, amount: value });
      toast({ title: 'Advance recorded', description: `${formatDZD(value)} on ${date}.` });
      setAmount(''); setDesc('');
      await load();
      onChanged?.();
    } catch (err) {
      toast({ title: 'Could not record advance', description: describeError(err), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: AcompteRow) => {
    if (row.settled_payment_id) {
      toast({
        title: 'Already settled',
        description: 'This advance was deducted by a payment. Delete that payment first.',
        variant: 'destructive',
      });
      return;
    }
    try {
      await deleteAcompte(row.id);
      await load();
      onChanged?.();
      toast({ title: 'Advance deleted' });
    } catch (e) {
      toast({ title: 'Could not delete', description: describeError(e), variant: 'destructive' });
    }
  };

  const pending = rows.filter((r) => !r.settled_payment_id);
  const pendingTotal = pending.reduce((s, r) => s + Number(r.amount), 0);

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-gym-gray border-gym-gold/20 text-gym-gold max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 gradient-text">
            <HandCoins className="w-5 h-5" />Acompte — {worker?.full_name}
          </DialogTitle>
          <DialogDescription className="text-gym-gold/60">
            Advances not yet deducted are subtracted from the next payment.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="gym-input" />
            </div>
            <div className="space-y-1.5">
              <Label>Amount (DZD) *</Label>
              <Input type="number" min="0" step="0.01" value={amount}
                     onChange={(e) => setAmount(e.target.value)} className="gym-input" placeholder="5000" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)}
                      className="gym-input min-h-[60px]" placeholder="Reason for the advance…" />
          </div>
          <Button type="submit" className="w-full gym-button" disabled={busy}>
            <Plus className="w-4 h-4 mr-2" />{busy ? 'Saving…' : 'Add advance'}
          </Button>
        </form>

        <Separator className="bg-gym-gold/15" />

        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gym-gold/80">History</h3>
          {pendingTotal > 0 && (
            <Badge className="bg-amber-500/20 text-amber-300 border-0">
              {formatDZD(pendingTotal)} pending
            </Badge>
          )}
        </div>

        <ScrollArea className="max-h-[240px]">
          {loading ? (
            <p className="text-sm text-gym-gold/40 py-6 text-center">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-gym-gold/40 py-6 text-center">No advances yet.</p>
          ) : (
            <div className="space-y-2 pr-2">
              {rows.map((r) => (
                <div key={r.id} className="flex items-start gap-3 p-2.5 rounded-lg border border-gym-gold/15">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gym-gold">{formatDZD(r.amount)}</span>
                      {r.settled_payment_id
                        ? <Badge variant="outline" className="border-green-500/40 text-green-400 text-[10px] h-4">settled</Badge>
                        : <Badge variant="outline" className="border-amber-500/40 text-amber-300 text-[10px] h-4">pending</Badge>}
                    </div>
                    <p className="text-xs text-gym-gold/50">{r.acompte_date}</p>
                    {r.description && <p className="text-xs text-gym-gold/60 mt-0.5 break-words">{r.description}</p>}
                  </div>
                  {canDelete && !r.settled_payment_id && (
                    <Button size="icon" variant="ghost" onClick={() => remove(r)}
                            className="h-7 w-7 text-red-400 hover:bg-red-500/10 shrink-0"
                            aria-label="Delete advance">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
