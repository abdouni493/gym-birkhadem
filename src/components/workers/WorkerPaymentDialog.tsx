import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Wallet, AlertTriangle, Trash2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { formatDZD, cn } from '@/lib/utils';
import { describeError } from '@/lib/supabase';
import {
  Worker, listAcomptes, listAbsences, listPayments, recordPayment, deletePayment,
} from '@/lib/api/workers';
import {
  computeUnpaidPeriods, computePayment, unsettled,
  AcompteRow, AbsenceRow, PaymentRow, UnpaidPeriod,
} from '@/lib/workerPay';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  worker: Worker | null;
  onSaved?: () => void;
}

const today = () => new Date().toISOString().split('T')[0];

/**
 * Salary settlement.
 *
 * Lists the unpaid months/days, the advances and absence costs that have not
 * yet been deducted, computes the total, and lets the admin override it.
 * The maths lives in workerPay.ts — this only renders and submits it.
 */
export const WorkerPaymentDialog: React.FC<Props> = ({ isOpen, onClose, worker, onSaved }) => {
  const [acomptes, setAcomptes] = useState<AcompteRow[]>([]);
  const [absences, setAbsences] = useState<AbsenceRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const [payDate, setPayDate] = useState(today());
  const [description, setDescription] = useState('');
  const [override, setOverride] = useState(false);
  const [manualAmount, setManualAmount] = useState('');

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!worker) return;
    setLoading(true);
    try {
      const [ac, ab, pay] = await Promise.all([
        listAcomptes(worker.id), listAbsences(worker.id), listPayments(worker.id),
      ]);
      setAcomptes(ac); setAbsences(ab); setPayments(pay);
    } catch (e) {
      toast({ title: 'Could not load payment data', description: describeError(e), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !worker) return;
    setPayDate(today());
    setDescription('');
    setOverride(false);
    setManualAmount('');
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, worker]);

  const allPeriods = useMemo<UnpaidPeriod[]>(() => {
    if (!worker) return [];
    return computeUnpaidPeriods(
      {
        payEnabled: worker.pay_enabled,
        payType: worker.pay_type,
        payAmount: Number(worker.pay_amount) || 0,
        startDate: worker.start_date,
      },
      payments,
    );
  }, [worker, payments]);

  // Default to paying everything outstanding.
  useEffect(() => {
    setSelectedKeys(new Set(allPeriods.map((p) => p.key)));
  }, [allPeriods]);

  const openAcomptes = useMemo(() => unsettled(acomptes), [acomptes]);
  const openAbsences = useMemo(() => unsettled(absences).filter((a) => Number(a.cost) > 0), [absences]);

  const selectedPeriods = useMemo(
    () => allPeriods.filter((p) => selectedKeys.has(p.key)),
    [allPeriods, selectedKeys],
  );

  const calc = useMemo(
    () => computePayment(selectedPeriods, allPeriods, openAcomptes, openAbsences),
    [selectedPeriods, allPeriods, openAcomptes, openAbsences],
  );

  const finalAmount = override ? Number(manualAmount) || 0 : calc.computed;

  const togglePeriod = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const submit = async () => {
    if (!worker) return;
    if (selectedPeriods.length === 0) {
      toast({ title: 'Nothing selected', description: 'Choose at least one period to pay.', variant: 'destructive' });
      return;
    }
    if (finalAmount < 0) {
      toast({ title: 'Invalid amount', description: 'The amount cannot be negative.', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      await recordPayment({
        workerId: worker.id,
        periods: selectedPeriods,
        gross: calc.gross,
        acomptesTotal: calc.acomptesTotal,
        absencesTotal: calc.absencesTotal,
        computed: calc.computed,
        finalAmount,
        isManualOverride: override,
        paymentDate: payDate,
        description: description || null,
        acompteIds: openAcomptes.map((a) => a.id),
        absenceIds: openAbsences.map((a) => a.id),
      });
      toast({ title: 'Payment recorded', description: `${formatDZD(finalAmount)} paid to ${worker.full_name}.` });
      onSaved?.();
      onClose();
    } catch (e) {
      toast({ title: 'Could not record payment', description: describeError(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const removePayment = async (id: string) => {
    try {
      await deletePayment(id);
      toast({ title: 'Payment deleted', description: 'Its advances and absences are pending again.' });
      await load();
      onSaved?.();
    } catch (e) {
      toast({ title: 'Could not delete payment', description: describeError(e), variant: 'destructive' });
    }
  };

  const unit = worker?.pay_type === 'daily' ? 'day' : 'month';

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-gym-gray border-gym-gold/20 text-gym-gold max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 gradient-text">
            <Wallet className="w-5 h-5" />Payment — {worker?.full_name}
          </DialogTitle>
          <DialogDescription className="text-gym-gold/60">
            Unpaid {unit}s, minus advances and absence costs not yet deducted.
          </DialogDescription>
        </DialogHeader>

        {!worker?.pay_enabled ? (
          <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
            <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm text-amber-200 font-medium">This worker is not paid through the app.</p>
              <p className="text-xs text-amber-200/70 mt-1">
                Edit the worker and turn on Payment to set a rate.
              </p>
            </div>
          </div>
        ) : loading ? (
          <p className="py-12 text-center text-gym-gold/50">Loading…</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Unpaid periods */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gym-gold/80">Unpaid {unit}s</h3>
                  <Badge variant="outline" className="border-gym-gold/30 text-gym-gold/70 text-xs">
                    {selectedKeys.size}/{allPeriods.length}
                  </Badge>
                </div>
                <ScrollArea className="h-[200px] rounded-lg border border-gym-gold/20 p-2">
                  {allPeriods.length === 0 ? (
                    <p className="text-xs text-gym-gold/40 p-3 text-center">
                      Everything is paid up to today.
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {allPeriods.map((p) => (
                        <label key={p.key}
                               className="flex items-center gap-3 p-2 rounded-lg hover:bg-gym-gold/5 cursor-pointer">
                          <Checkbox checked={selectedKeys.has(p.key)}
                                    onCheckedChange={() => togglePeriod(p.key)}
                                    className="border-gym-gold/40 data-[state=checked]:bg-gym-gold data-[state=checked]:text-gym-black" />
                          <span className="text-sm flex-1">{p.label}</span>
                          <span className="text-xs text-gym-gold/60">{formatDZD(p.amount)}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>

              {/* Deductions */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-gym-gold/80">Pending deductions</h3>
                <ScrollArea className="h-[200px] rounded-lg border border-gym-gold/20 p-2">
                  {openAcomptes.length === 0 && openAbsences.length === 0 ? (
                    <p className="text-xs text-gym-gold/40 p-3 text-center">Nothing to deduct.</p>
                  ) : (
                    <div className="space-y-1">
                      {openAcomptes.map((a) => (
                        <div key={a.id} className="flex items-center gap-2 p-2 rounded-lg bg-red-500/5">
                          <Badge variant="outline" className="border-amber-500/40 text-amber-300 text-[10px] h-4 shrink-0">
                            acompte
                          </Badge>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-gym-gold/70 truncate">{a.description || a.acompte_date}</p>
                          </div>
                          <span className="text-xs text-red-400 shrink-0">−{formatDZD(a.amount)}</span>
                        </div>
                      ))}
                      {openAbsences.map((a) => (
                        <div key={a.id} className="flex items-center gap-2 p-2 rounded-lg bg-red-500/5">
                          <Badge variant="outline" className="border-orange-500/40 text-orange-300 text-[10px] h-4 shrink-0">
                            absence
                          </Badge>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-gym-gold/70 truncate">{a.description || a.absence_date}</p>
                          </div>
                          <span className="text-xs text-red-400 shrink-0">−{formatDZD(a.cost)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </div>

            {/* Breakdown */}
            <div className="rounded-lg border border-gym-gold/20 p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gym-gold/60">
                  Gross ({selectedPeriods.length} {unit}{selectedPeriods.length === 1 ? '' : 's'})
                </span>
                <span>{formatDZD(calc.gross)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gym-gold/60">Advances</span>
                <span className="text-red-400">−{formatDZD(calc.acomptesTotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gym-gold/60">Absences</span>
                <span className="text-red-400">−{formatDZD(calc.absencesTotal)}</span>
              </div>
              <Separator className="bg-gym-gold/15" />
              <div className="flex justify-between font-semibold">
                <span>Calculated</span>
                <span className={cn(calc.isNegative && 'text-red-400')}>{formatDZD(calc.computed)}</span>
              </div>

              {calc.isNegative && (
                <div className="flex items-start gap-2 rounded border border-red-500/40 bg-red-500/10 p-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                  <p className="text-[11px] text-red-300 leading-relaxed">
                    Deductions exceed the amount owed by {formatDZD(Math.abs(calc.rawComputed))}.
                    The payment is shown as 0 — the remainder stays owed by the worker.
                  </p>
                </div>
              )}
            </div>

            {/* Final */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="override" className="cursor-pointer">Set the amount manually</Label>
                <Switch id="override" checked={override}
                        onCheckedChange={(v) => {
                          setOverride(v);
                          if (v) setManualAmount(String(calc.computed));
                        }} />
              </div>

              {override && (
                <div className="space-y-1.5">
                  <Label>Amount to pay (DZD)</Label>
                  <Input type="number" min="0" step="0.01" value={manualAmount}
                         onChange={(e) => setManualAmount(e.target.value)} className="gym-input" />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Payment date *</Label>
                  <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className="gym-input" />
                </div>
                <div className="space-y-1.5">
                  <Label>Description <span className="text-gym-gold/40">(optional)</span></Label>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)}
                         className="gym-input" placeholder="Note…" />
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-gym-gold/10 p-3">
                <span className="font-semibold">Total to pay</span>
                <span className="text-xl font-bold gradient-text">{formatDZD(finalAmount)}</span>
              </div>
            </div>

            {/* History */}
            {payments.length > 0 && (
              <>
                <Separator className="bg-gym-gold/15" />
                <h3 className="text-sm font-semibold text-gym-gold/80">Payment history</h3>
                <ScrollArea className="max-h-[160px]">
                  <div className="space-y-2 pr-2">
                    {payments.map((p) => (
                      <div key={p.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-gym-gold/15">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold">{formatDZD(p.final_amount)}</p>
                          <p className="text-xs text-gym-gold/50">
                            {p.period_start} → {p.period_end} · paid {p.payment_date}
                          </p>
                          {p.description && <p className="text-xs text-gym-gold/60 truncate">{p.description}</p>}
                        </div>
                        <Button size="icon" variant="ghost" onClick={() => removePayment(p.id)}
                                className="h-7 w-7 text-red-400 hover:bg-red-500/10 shrink-0"
                                aria-label="Delete payment">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button className="gym-button" onClick={submit}
                  disabled={saving || loading || !worker?.pay_enabled || selectedPeriods.length === 0}>
            {saving ? 'Saving…' : `Pay ${formatDZD(finalAmount)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
