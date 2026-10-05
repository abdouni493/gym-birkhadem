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
import { CalendarX, Plus, Trash2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { formatDZD } from '@/lib/utils';
import { describeError } from '@/lib/supabase';
import { Worker, listAbsences, addAbsence, deleteAbsence } from '@/lib/api/workers';
import type { AbsenceRow } from '@/lib/workerPay';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  worker: Worker | null;
  onChanged?: () => void;
  canDelete?: boolean;
}

const today = () => new Date().toISOString().split('T')[0];

/** Absences with a cost. Unsettled costs are deducted by the next payment. */
export const AbsenceDialog: React.FC<Props> = ({ isOpen, onClose, worker, onChanged, canDelete = true }) => {
  const [rows, setRows] = useState<AbsenceRow[]>([]);
  const [date, setDate] = useState(today());
  const [cost, setCost] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!worker) return;
    setLoading(true);
    try {
      setRows(await listAbsences(worker.id));
    } catch (e) {
      toast({ title: 'Could not load absences', description: describeError(e), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && worker) {
      load();
      setDate(today()); setCost(''); setDesc('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, worker]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!worker) return;
    // A zero-cost absence is legitimate: recorded, but nothing is deducted.
    const value = Number(cost) || 0;
    if (value < 0) {
      toast({ title: 'Invalid cost', description: 'The cost cannot be negative.', variant: 'destructive' });
      return;
    }

    setBusy(true);
    try {
      await addAbsence(worker.id, { absence_date: date, description: desc || null, cost: value });
      toast({ title: 'Absence recorded', description: value > 0 ? `${formatDZD(value)} will be deducted.` : 'No cost deducted.' });
      setCost(''); setDesc('');
      await load();
      onChanged?.();
    } catch (err) {
      toast({ title: 'Could not record absence', description: describeError(err), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: AbsenceRow) => {
    if (row.settled_payment_id) {
      toast({
        title: 'Already settled',
        description: 'This absence was deducted by a payment. Delete that payment first.',
        variant: 'destructive',
      });
      return;
    }
    try {
      await deleteAbsence(row.id);
      await load();
      onChanged?.();
      toast({ title: 'Absence deleted' });
    } catch (e) {
      toast({ title: 'Could not delete', description: describeError(e), variant: 'destructive' });
    }
  };

  const pending = rows.filter((r) => !r.settled_payment_id);
  const pendingTotal = pending.reduce((s, r) => s + Number(r.cost), 0);

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-gym-gray border-gym-gold/20 text-gym-gold max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 gradient-text">
            <CalendarX className="w-5 h-5" />Absence — {worker?.full_name}
          </DialogTitle>
          <DialogDescription className="text-gym-gold/60">
            Absence costs not yet deducted are subtracted from the next payment.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="gym-input" />
            </div>
            <div className="space-y-1.5">
              <Label>Cost (DZD)</Label>
              <Input type="number" min="0" step="0.01" value={cost}
                     onChange={(e) => setCost(e.target.value)} className="gym-input" placeholder="0" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)}
                      className="gym-input min-h-[60px]" placeholder="Reason for the absence…" />
          </div>
          <Button type="submit" className="w-full gym-button" disabled={busy}>
            <Plus className="w-4 h-4 mr-2" />{busy ? 'Saving…' : 'Add absence'}
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
            <p className="text-sm text-gym-gold/40 py-6 text-center">No absences recorded.</p>
          ) : (
            <div className="space-y-2 pr-2">
              {rows.map((r) => (
                <div key={r.id} className="flex items-start gap-3 p-2.5 rounded-lg border border-gym-gold/15">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gym-gold">
                        {Number(r.cost) > 0 ? formatDZD(r.cost) : 'No cost'}
                      </span>
                      {r.settled_payment_id
                        ? <Badge variant="outline" className="border-green-500/40 text-green-400 text-[10px] h-4">settled</Badge>
                        : Number(r.cost) > 0 &&
                          <Badge variant="outline" className="border-amber-500/40 text-amber-300 text-[10px] h-4">pending</Badge>}
                    </div>
                    <p className="text-xs text-gym-gold/50">{r.absence_date}</p>
                    {r.description && <p className="text-xs text-gym-gold/60 mt-0.5 break-words">{r.description}</p>}
                  </div>
                  {canDelete && !r.settled_payment_id && (
                    <Button size="icon" variant="ghost" onClick={() => remove(r)}
                            className="h-7 w-7 text-red-400 hover:bg-red-500/10 shrink-0"
                            aria-label="Delete absence">
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
