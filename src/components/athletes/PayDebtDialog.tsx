import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { HandCoins, CalendarCheck, Receipt, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { formatDZD, cn } from '@/lib/utils';
import { describeError } from '@/lib/supabase';
import { useLang } from '@/hooks/useLang';
import type { Athlete } from '@/lib/api/athletes';
import { DebtItem, listDebtItems, payDebt } from '@/lib/api/athleteExtras';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  athlete: Athlete | null;
  onSaved: () => void;
}

const today = () => new Date().toISOString().split('T')[0];

export const PayDebtDialog: React.FC<Props> = ({ isOpen, onClose, athlete, onSaved }) => {
  const { tr, fmtDate } = useLang();
  const [items, setItems] = useState<DebtItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen || !athlete) return;
    let active = true;
    setLoading(true);
    setNote('');
    setDate(today());
    listDebtItems(athlete.id)
      .then((rows) => {
        if (!active) return;
        setItems(rows);
        setSelected(new Set(rows.map((r) => r.id)));
        setAmount(String(rows.reduce((s, r) => s + r.remaining, 0)));
      })
      .catch((e) => toast({ title: tr('Chargement impossible', 'تعذر التحميل'), description: describeError(e), variant: 'destructive' }))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [isOpen, athlete]); // eslint-disable-line react-hooks/exhaustive-deps

  const chosen = useMemo(() => items.filter((i) => selected.has(i.id)), [items, selected]);
  const totalDebt = useMemo(() => items.reduce((s, i) => s + i.remaining, 0), [items]);
  const chosenDebt = useMemo(() => chosen.reduce((s, i) => s + i.remaining, 0), [chosen]);
  const chosenTotal = useMemo(() => chosen.reduce((s, i) => s + i.total, 0), [chosen]);
  const chosenPaid = useMemo(() => chosen.reduce((s, i) => s + i.paid, 0), [chosen]);
  const payNow = Math.min(Math.max(0, Number(amount) || 0), chosenDebt);
  const restAfter = Math.max(0, chosenDebt - payNow);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      const debt = items.filter((i) => next.has(i.id)).reduce((s, i) => s + i.remaining, 0);
      setAmount(String(debt));
      return next;
    });
  };

  const submit = async () => {
    if (!athlete) return;
    if (payNow <= 0) {
      toast({ title: tr('Saisissez un montant', 'أدخل مبلغًا'), variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await payDebt({
        athleteId: athlete.id,
        amount: payNow,
        paymentDate: date,
        description: note || chosen.map((c) => c.label).join(', '),
        items: chosen,
        currentTotalPaid: Number(athlete.total_paid || 0),
      });
      toast({
        title: tr('Paiement enregistré', 'تم تسجيل الدفع'),
        description: `${athlete.full_name} — ${formatDZD(payNow)} · ${tr('Reste', 'الباقي')} ${formatDZD(restAfter)}`,
      });
      onSaved();
      onClose();
    } catch (e) {
      toast({ title: tr('Enregistrement impossible', 'تعذر الحفظ'), description: describeError(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-gym-gray border-gym-gold/25 text-gym-gold-light max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 gradient-text text-xl">
            <HandCoins className="w-5 h-5 text-gym-gold" />{tr('Payer la dette', 'تسديد الدين')} — {athlete?.full_name}
          </DialogTitle>
          <DialogDescription className="text-gym-gold/60">
            {tr('Choisissez ce qui est payé et saisissez le montant versé aujourd’hui.', 'اختر ما سيتم دفعه وأدخل المبلغ المدفوع اليوم.')}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gym-gold" /></div>
        ) : items.length === 0 ? (
          <p className="py-10 text-center text-green-400">{tr('Cet athlète n’a aucune dette.', 'هذا الرياضي ليس عليه أي دين.')}</p>
        ) : (
          <div className="space-y-4">
            {/* Total debt banner */}
            <div className="rounded-xl bg-gradient-to-br from-red-500/20 to-red-900/10 border border-red-500/30 p-4 flex items-center justify-between">
              <span className="text-sm text-red-200">{tr('Dette totale', 'إجمالي الدين')}</span>
              <span className="text-2xl font-bold text-red-300">{formatDZD(totalDebt)}</span>
            </div>

            {/* Where the debt comes from */}
            <div className="space-y-2">
              <Label className="text-xs text-gym-gold/60">{tr('Origine de la dette', 'مصدر الدين')}</Label>
              {items.map((i) => (
                <label key={i.id}
                       className={cn('flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                         selected.has(i.id) ? 'border-gym-gold/50 bg-gym-gold/5' : 'border-gym-gold/15 opacity-70')}>
                  <Checkbox checked={selected.has(i.id)} onCheckedChange={() => toggle(i.id)}
                            className="border-gym-gold/50 data-[state=checked]:bg-gym-gold data-[state=checked]:text-gym-black" />
                  <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                    i.kind === 'subscription' ? 'bg-purple-500/15 text-purple-300' : 'bg-blue-500/15 text-blue-300')}>
                    {i.kind === 'subscription' ? <CalendarCheck className="w-4 h-4" /> : <Receipt className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {i.kind === 'subscription' ? tr('Abonnement', 'اشتراك') : tr('Frais supplémentaire', 'رسوم إضافية')} : {i.label}
                    </p>
                    <p className="text-[11px] text-gym-gold/50">
                      {fmtDate(i.date)} · {tr('Total', 'المجموع')} {formatDZD(i.total)} · {tr('Payé', 'مدفوع')} {formatDZD(i.paid)}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-red-300 shrink-0">{formatDZD(i.remaining)}</span>
                </label>
              ))}
            </div>

            {/* Totals of the selection */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-gym-black/50 border border-gym-gold/15 p-2">
                <p className="text-[10px] text-gym-gold/50">{tr('Montant total', 'المبلغ الإجمالي')}</p>
                <p className="text-sm font-bold">{formatDZD(chosenTotal)}</p>
              </div>
              <div className="rounded-lg bg-gym-black/50 border border-gym-gold/15 p-2">
                <p className="text-[10px] text-gym-gold/50">{tr('Déjà payé', 'المدفوع سابقًا')}</p>
                <p className="text-sm font-bold text-green-400">{formatDZD(chosenPaid)}</p>
              </div>
              <div className="rounded-lg bg-gym-black/50 border border-gym-gold/15 p-2">
                <p className="text-[10px] text-gym-gold/50">{tr('Reste à payer', 'المتبقي للدفع')}</p>
                <p className="text-sm font-bold text-red-300">{formatDZD(chosenDebt)}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{tr('Montant payé cette fois', 'المبلغ المدفوع هذه المرة')} *</Label>
                <Input type="number" min="0" step="0.01" value={amount}
                       onChange={(e) => setAmount(e.target.value)} className="gym-input text-lg font-semibold" />
              </div>
              <div className="space-y-1.5">
                <Label>{tr('Date du paiement', 'تاريخ الدفع')}</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="gym-input" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{tr('Note (optionnel)', 'ملاحظة (اختياري)')}</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} className="gym-input" />
            </div>

            <div className={cn('flex items-center justify-between rounded-xl p-4 border',
              restAfter > 0 ? 'bg-orange-500/10 border-orange-500/30' : 'bg-green-500/10 border-green-500/30')}>
              <span className="text-sm">{tr('Reste après ce paiement', 'الباقي بعد هذا الدفع')}</span>
              <span className={cn('text-xl font-bold', restAfter > 0 ? 'text-orange-300' : 'text-green-400')}>
                {formatDZD(restAfter)}
              </span>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}
                  className="text-gym-gold/70 hover:text-gym-gold hover:bg-gym-gold/10">{tr('Annuler', 'إلغاء')}</Button>
          <Button className="gym-button" onClick={submit} disabled={saving || loading || items.length === 0 || payNow <= 0}>
            {saving ? tr('Enregistrement…', 'جارٍ الحفظ…') : tr('Enregistrer le paiement', 'حفظ الدفع')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
