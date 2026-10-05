import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarCheck, RefreshCw } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { formatDZD } from '@/lib/utils';
import { describeError } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/lib/i18n';
import {
  Athlete, Subscription, AthleteSubscription,
  listSubscriptionTypes, listAthleteSubscriptions, assignSubscription,
} from '@/lib/api/athletes';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  athlete: Athlete | null;
  onSaved: () => void;
  /** 'renew' pre-selects the athlete's most recent plan. */
  mode?: 'assign' | 'renew';
}

const today = () => new Date().toISOString().split('T')[0];

export const SubscriptionDialog: React.FC<Props> = ({ isOpen, onClose, athlete, onSaved, mode = 'assign' }) => {
  const { language } = useAuth();
  const { t } = useTranslation(language);

  const [types, setTypes] = useState<Subscription[]>([]);
  const [history, setHistory] = useState<AthleteSubscription[]>([]);
  const [typeId, setTypeId] = useState('');
  const [paymentDate, setPaymentDate] = useState(today());
  const [amountPaid, setAmountPaid] = useState('');
  const [useCredit, setUseCredit] = useState(false);
  const [saving, setSaving] = useState(false);

  const selected = useMemo(() => types.find((t2) => t2.id === typeId) ?? null, [types, typeId]);
  const balance = athlete?.account_balance ?? 0;
  const isRenew = mode === 'renew';

  useEffect(() => {
    if (!isOpen || !athlete) return;
    let active = true;
    setTypeId(''); setPaymentDate(today()); setAmountPaid(''); setUseCredit(false);
    (async () => {
      try {
        const [ty, hi] = await Promise.all([
          listSubscriptionTypes(), listAthleteSubscriptions(athlete.id),
        ]);
        if (!active) return;
        setTypes(ty);
        setHistory(hi ?? []);
        // Renew: default to the most recent plan when it still exists in the catalog.
        if (isRenew && hi && hi.length > 0) {
          const lastId = hi[0].subscription_id;
          if (lastId && ty.some((x) => x.id === lastId)) setTypeId(lastId);
        }
      } catch (e) {
        toast({ title: t('athX.couldNotLoad'), description: describeError(e), variant: 'destructive' });
      }
    })();
    return () => { active = false; };
  }, [isOpen, athlete, isRenew]); // eslint-disable-line react-hooks/exhaustive-deps

  // Default the amount to the full price when a type is chosen.
  useEffect(() => {
    if (selected) setAmountPaid(String(selected.price));
  }, [selected]);

  const creditUsed = useCredit && selected ? Math.min(balance, selected.price) : 0;
  const effectivePaid = useCredit ? creditUsed : Number(amountPaid) || 0;

  const submit = async () => {
    if (!athlete || !selected) {
      toast({ title: t('athX.selectSubscription'), variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await assignSubscription({
        athleteId: athlete.id,
        subscription: selected,
        paymentDate,
        amountPaid: effectivePaid,
        creditUsed,
        currentBalance: balance,
        currentTotalPaid: athlete.total_paid,
      });
      toast({ title: t('athX.subAssigned'), description: `${selected.name} — ${athlete.full_name}` });
      onSaved();
      onClose();
    } catch (e) {
      toast({ title: t('athX.couldNotSave'), description: describeError(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const dayInitial = t('athX.days').charAt(0);

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-gym-gray border-gym-gold/25 text-gym-gold-light max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 gradient-text text-xl">
            {isRenew ? <RefreshCw className="w-5 h-5" /> : <CalendarCheck className="w-5 h-5" />}
            {isRenew ? t('athX.renewTitle') : t('athX.assignTitle')} — {athlete?.full_name}
          </DialogTitle>
          <DialogDescription className="text-gym-gold/60">
            {t('athX.availableCredit')}: {formatDZD(balance)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t('athX.subscription')} *</Label>
            <Select value={typeId} onValueChange={setTypeId}>
              <SelectTrigger className="gym-input"><SelectValue placeholder={t('athX.selectSubscription')} /></SelectTrigger>
              <SelectContent className="bg-gym-gray border-gym-gold/30 text-gym-gold-light">
                {types.map((ty) => (
                  <SelectItem key={ty.id} value={ty.id}>
                    {ty.name} — {formatDZD(ty.price)}{ty.duration > 0 ? ` · ${ty.duration}${dayInitial}` : ` · ${t('athX.open')}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selected && (
            <div className="rounded-lg border border-gym-gold/20 p-3 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-gym-gold/60">{t('athX.price')}</span><span>{formatDZD(selected.price)}</span></div>
              <div className="flex justify-between"><span className="text-gym-gold/60">{t('athX.duration')}</span>
                <span>{selected.duration > 0 ? `${selected.duration} ${t('athX.days')}` : t('athX.open')}</span></div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('athX.paymentDate')}</Label>
              <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="gym-input" />
            </div>
            <div className="space-y-1.5">
              <Label>{t('athX.amountPaid')}</Label>
              <Input type="number" min="0" step="0.01" value={useCredit ? creditUsed : amountPaid}
                     disabled={useCredit}
                     onChange={(e) => setAmountPaid(e.target.value)} className="gym-input" />
            </div>
          </div>

          {balance > 0 && (
            <div className="flex items-center justify-between rounded-lg border border-gym-gold/20 p-3">
              <div>
                <Label className="cursor-pointer">{t('athX.payWithCredit')}</Label>
                <p className="text-[11px] text-gym-gold/40">{formatDZD(Math.min(balance, selected?.price ?? 0))}</p>
              </div>
              <Switch checked={useCredit} onCheckedChange={setUseCredit} disabled={!selected} />
            </div>
          )}

          {selected && (
            <div className="flex items-center justify-between rounded-lg bg-gym-gold/10 p-3">
              <span className="text-sm">{t('athX.remainingAfter')}</span>
              <span className="font-bold">{formatDZD(Math.max(0, selected.price - effectivePaid))}</span>
            </div>
          )}

          {history.length > 0 && (
            <>
              <Separator className="bg-gym-gold/15" />
              <h3 className="text-sm font-semibold text-gym-gold/80">{t('athX.history')}</h3>
              <ScrollArea className="max-h-[180px]">
                <div className="space-y-1.5 pr-2">
                  {history.map((h) => (
                    <div key={h.id} className="flex items-center justify-between p-2.5 rounded-lg border border-gym-gold/15">
                      <div className="min-w-0">
                        <p className="text-sm truncate">{h.name}</p>
                        <p className="text-xs text-gym-gold/40">{h.payment_date}{h.expiry_date && ` → ${h.expiry_date}`}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs">{formatDZD(h.amount_paid)} / {formatDZD(h.price)}</p>
                        {h.remaining > 0
                          ? <Badge variant="outline" className="border-red-500/40 text-red-400 text-[10px] h-4">{formatDZD(h.remaining)} {t('athX.due')}</Badge>
                          : <Badge variant="outline" className="border-green-500/40 text-green-400 text-[10px] h-4">{t('athX.paid')}</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}
                  className="text-gym-gold/70 hover:text-gym-gold hover:bg-gym-gold/10">
            {t('athX.cancel')}
          </Button>
          <Button className="gym-button" onClick={submit} disabled={saving || !selected}>
            {saving ? t('athX.saving') : isRenew ? t('athX.renew') : t('common.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
