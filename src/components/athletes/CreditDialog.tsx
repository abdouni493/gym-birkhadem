import React, { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Wallet } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { formatDZD } from '@/lib/utils';
import { describeError } from '@/lib/supabase';
import { Athlete, addCredit } from '@/lib/api/athletes';
import { tr } from '@/lib/i18n';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  athlete: Athlete | null;
  onSaved: () => void;
}

export const CreditDialog: React.FC<Props> = ({ isOpen, onClose, athlete, onSaved }) => {
  const [amount, setAmount] = useState('');
  const [desc, setDesc] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) { setAmount(''); setDesc(''); }
  }, [isOpen]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(amount);
    if (!value || value <= 0) {
      toast({ title: tr('Saisissez un montant', 'أدخل مبلغًا'), variant: 'destructive' });
      return;
    }
    if (!athlete) return;
    setSaving(true);
    try {
      await addCredit({
        athleteId: athlete.id, amount: value, description: desc || null,
        currentBalance: athlete.account_balance,
      });
      toast({ title: tr('Crédit ajouté', 'تمت إضافة الرصيد'), description: tr(`${formatDZD(value)} ajouté à ${athlete.full_name}.`, `تمت إضافة ${formatDZD(value)} إلى ${athlete.full_name}.`) });
      onSaved();
      onClose();
    } catch (err) {
      toast({ title: tr('Impossible d’ajouter le crédit', 'تعذر إضافة الرصيد'), description: describeError(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-gym-gray border-gym-gold/20 text-gym-gold max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 gradient-text">
            <Wallet className="w-5 h-5" />{tr('Ajouter du crédit', 'إضافة رصيد')} — {athlete?.full_name}
          </DialogTitle>
          <DialogDescription className="text-gym-gold/60">
            {tr('Solde actuel', 'الرصيد الحالي')} : {formatDZD(athlete?.account_balance ?? 0)}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>{tr('Montant (DA)', 'المبلغ (دج)')} *</Label>
            <Input type="number" min="0" step="0.01" value={amount}
                   onChange={(e) => setAmount(e.target.value)} className="gym-input" placeholder="1000" />
          </div>
          <div className="space-y-1.5">
            <Label>{tr('Description', 'الوصف')}</Label>
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)}
                      className="gym-input min-h-[60px]" placeholder={tr('Note…', 'ملاحظة…')} />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>{tr('Annuler', 'إلغاء')}</Button>
            <Button type="submit" className="gym-button" disabled={saving}>
              {saving ? tr('Enregistrement…', 'جارٍ الحفظ…') : tr('Ajouter du crédit', 'إضافة رصيد')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
