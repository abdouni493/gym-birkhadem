import React, { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CalendarCheck } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { formatDZD, cn } from '@/lib/utils';
import { describeError } from '@/lib/supabase';
import { useLang } from '@/hooks/useLang';
import type { AthleteSubscription } from '@/lib/api/athletes';
import { updateAthleteSubscription } from '@/lib/api/athleteExtras';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  subscription: AthleteSubscription | null;
  onSaved: () => void;
}

/** Shared fields for editing one athlete subscription (also embedded in the athlete form). */
export interface SubFields { name: string; price: string; payment_date: string; expiry_date: string; amount_paid: string }

export const subFieldsFrom = (s: AthleteSubscription): SubFields => ({
  name: s.name,
  price: String(s.price),
  payment_date: s.payment_date,
  expiry_date: s.expiry_date ?? '',
  amount_paid: String(s.amount_paid),
});

export const SubscriptionFields: React.FC<{ value: SubFields; onChange: (v: SubFields) => void }> = ({ value, onChange }) => {
  const { tr } = useLang();
  const set = (k: keyof SubFields, v: string) => onChange({ ...value, [k]: v });
  const rest = Math.max(0, (Number(value.price) || 0) - (Number(value.amount_paid) || 0));
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>{tr('Nom de l’abonnement', 'اسم الاشتراك')}</Label>
        <Input value={value.name} onChange={(e) => set('name', e.target.value)} className="gym-input" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>{tr('Date de paiement', 'تاريخ الدفع')}</Label>
          <Input type="date" value={value.payment_date} onChange={(e) => set('payment_date', e.target.value)} className="gym-input" />
        </div>
        <div className="space-y-1.5">
          <Label>{tr('Date d’expiration', 'تاريخ الانتهاء')}</Label>
          <Input type="date" value={value.expiry_date} onChange={(e) => set('expiry_date', e.target.value)} className="gym-input" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>{tr('Prix', 'السعر')}</Label>
          <Input type="number" min="0" step="0.01" value={value.price} onChange={(e) => set('price', e.target.value)} className="gym-input" />
        </div>
        <div className="space-y-1.5">
          <Label>{tr('Montant payé', 'المبلغ المدفوع')}</Label>
          <Input type="number" min="0" step="0.01" value={value.amount_paid} onChange={(e) => set('amount_paid', e.target.value)} className="gym-input" />
        </div>
      </div>
      <div className={cn('flex items-center justify-between rounded-lg px-3 py-2 text-sm',
        rest > 0 ? 'bg-orange-500/10 text-orange-300' : 'bg-green-500/10 text-green-400')}>
        <span>{tr('Reste à payer', 'المتبقي للدفع')}</span>
        <span className="font-bold">{formatDZD(rest)}</span>
      </div>
    </div>
  );
};

export const EditSubscriptionDialog: React.FC<Props> = ({ isOpen, onClose, subscription, onSaved }) => {
  const { tr } = useLang();
  const [fields, setFields] = useState<SubFields | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen && subscription) setFields(subFieldsFrom(subscription));
  }, [isOpen, subscription]);

  const submit = async () => {
    if (!subscription || !fields) return;
    if (!fields.name.trim() || !fields.payment_date) {
      toast({ title: tr('Vérifiez le formulaire', 'تحقق من النموذج'), variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await updateAthleteSubscription(subscription, {
        name: fields.name,
        price: Number(fields.price) || 0,
        payment_date: fields.payment_date,
        expiry_date: fields.expiry_date || null,
        amount_paid: Number(fields.amount_paid) || 0,
      });
      toast({ title: tr('Abonnement modifié', 'تم تعديل الاشتراك'), description: fields.name });
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
      <DialogContent className="bg-gym-gray border-gym-gold/25 text-gym-gold-light max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 gradient-text text-xl">
            <CalendarCheck className="w-5 h-5 text-gym-gold" />{tr('Modifier l’abonnement', 'تعديل الاشتراك')}
          </DialogTitle>
          <DialogDescription className="text-gym-gold/60">{subscription?.name}</DialogDescription>
        </DialogHeader>
        {fields && <SubscriptionFields value={fields} onChange={setFields} />}
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}
                  className="text-gym-gold/70 hover:text-gym-gold hover:bg-gym-gold/10">{tr('Annuler', 'إلغاء')}</Button>
          <Button className="gym-button" onClick={submit} disabled={saving}>
            {saving ? tr('Enregistrement…', 'جارٍ الحفظ…') : tr('Enregistrer', 'حفظ')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
