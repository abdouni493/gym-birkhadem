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
import { tr } from '@/lib/i18n';

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
      toast({ title: tr('Impossible de charger les absences', 'تعذر تحميل الغيابات'), description: describeError(e), variant: 'destructive' });
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
      toast({ title: tr('Coût invalide', 'تكلفة غير صالحة'), description: tr('Le coût ne peut pas être négatif.', 'لا يمكن أن تكون التكلفة سالبة.'), variant: 'destructive' });
      return;
    }

    setBusy(true);
    try {
      await addAbsence(worker.id, { absence_date: date, description: desc || null, cost: value });
      toast({ title: tr('Absence enregistrée', 'تم تسجيل الغياب'), description: value > 0 ? `${formatDZD(value)} will be deducted.` : tr('Aucun coût déduit.', 'لا توجد تكلفة مخصومة.') });
      setCost(''); setDesc('');
      await load();
      onChanged?.();
    } catch (err) {
      toast({ title: tr('Impossible d’enregistrer l’absence', 'تعذر تسجيل الغياب'), description: describeError(err), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: AbsenceRow) => {
    if (row.settled_payment_id) {
      toast({
        title: tr('Déjà réglé', 'تمت تسويته'),
        description: tr('Cette absence a été déduite par un paiement. Supprimez d’abord ce paiement.', 'تم خصم هذا الغياب في دفعة. احذف تلك الدفعة أولاً.'),
        variant: 'destructive',
      });
      return;
    }
    try {
      await deleteAbsence(row.id);
      await load();
      onChanged?.();
      toast({ title: tr('Absence supprimée', 'تم حذف الغياب') });
    } catch (e) {
      toast({ title: tr('Suppression impossible', 'تعذر الحذف'), description: describeError(e), variant: 'destructive' });
    }
  };

  const pending = rows.filter((r) => !r.settled_payment_id);
  const pendingTotal = pending.reduce((s, r) => s + Number(r.cost), 0);

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-gym-gray border-gym-gold/20 text-gym-gold max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 gradient-text">
            <CalendarX className="w-5 h-5" />{tr('Absence', 'غياب')} — {worker?.full_name}
          </DialogTitle>
          <DialogDescription className="text-gym-gold/60">
            {tr('Les coûts d’absence non déduits sont retirés du prochain paiement.', 'تُخصم تكاليف الغياب غير المخصومة من الدفعة القادمة.')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{tr('Date', 'التاريخ')} *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="gym-input" />
            </div>
            <div className="space-y-1.5">
              <Label>{tr('Coût (DA)', 'التكلفة (دج)')}</Label>
              <Input type="number" min="0" step="0.01" value={cost}
                     onChange={(e) => setCost(e.target.value)} className="gym-input" placeholder="0" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{tr('Description', 'الوصف')}</Label>
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)}
                      className="gym-input min-h-[60px]" placeholder={tr('Motif de l’absence…', 'سبب الغياب…')} />
          </div>
          <Button type="submit" className="w-full gym-button" disabled={busy}>
            <Plus className="w-4 h-4 me-2" />{busy ? tr('Enregistrement…', 'جارٍ الحفظ…') : tr('Ajouter une absence', 'إضافة غياب')}
          </Button>
        </form>

        <Separator className="bg-gym-gold/15" />

        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gym-gold/80">{tr('Historique', 'السجل')}</h3>
          {pendingTotal > 0 && (
            <Badge className="bg-amber-500/20 text-amber-300 border-0">
              {formatDZD(pendingTotal)} {tr('en attente', 'معلق')}
            </Badge>
          )}
        </div>

        <ScrollArea className="max-h-[240px]">
          {loading ? (
            <p className="text-sm text-gym-gold/40 py-6 text-center">{tr('Chargement…', 'جارٍ التحميل…')}</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-gym-gold/40 py-6 text-center">{tr('Aucune absence enregistrée.', 'لا توجد غيابات مسجلة.')}</p>
          ) : (
            <div className="space-y-2 pe-2">
              {rows.map((r) => (
                <div key={r.id} className="flex items-start gap-3 p-2.5 rounded-lg border border-gym-gold/15">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gym-gold">
                        {Number(r.cost) > 0 ? formatDZD(r.cost) : tr('Sans coût', 'بدون تكلفة')}
                      </span>
                      {r.settled_payment_id
                        ? <Badge variant="outline" className="border-green-500/40 text-green-400 text-[10px] h-4">{tr('réglé', 'مسدد')}</Badge>
                        : Number(r.cost) > 0 &&
                          <Badge variant="outline" className="border-amber-500/40 text-amber-300 text-[10px] h-4">{tr('en attente', 'معلق')}</Badge>}
                    </div>
                    <p className="text-xs text-gym-gold/50">{r.absence_date}</p>
                    {r.description && <p className="text-xs text-gym-gold/60 mt-0.5 break-words">{r.description}</p>}
                  </div>
                  {canDelete && !r.settled_payment_id && (
                    <Button size="icon" variant="ghost" onClick={() => remove(r)}
                            className="h-7 w-7 text-red-400 hover:bg-red-500/10 shrink-0"
                            aria-label={tr('Supprimer l’absence', 'حذف الغياب')}>
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
