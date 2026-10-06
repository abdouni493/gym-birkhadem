import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  User, Phone, CalendarCheck, Wallet, HandCoins, UserCheck, UserX, Receipt, Pencil, Trash2,
  History, Info, Dumbbell, Cake, Wifi, RefreshCw, Loader2, Plus, Clock, Package, Coins,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { formatDZD, cn } from '@/lib/utils';
import { describeError } from '@/lib/supabase';
import { usePermissions } from '@/contexts/AuthContext';
import { useLang } from '@/hooks/useLang';
import {
  Athlete, AthleteSubscription, SeanceHistory, getAthlete, listAthleteSubscriptions, listSeanceHistory,
} from '@/lib/api/athletes';
import {
  ExtraFee, AthletePayment, Attendance, CreditRow,
  listExtraFees, listPayments, listAttendance, listCredits,
  deleteExtraFee, deleteAttendance, deleteAthleteSubscription,
} from '@/lib/api/athleteExtras';
import { PayDebtDialog } from './PayDebtDialog';
import { AttendanceDialog } from './AttendanceDialog';
import { ExtraFeeDialog } from './ExtraFeeDialog';
import { EditSubscriptionDialog } from './EditSubscriptionDialog';
import { SubscriptionDialog } from './SubscriptionDialog';
import { AthleteFormDialog } from './AthleteFormDialog';
import { daysLeft } from './athleteStatus';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  athlete: Athlete | null;
  /** Called after anything changed, so the list can refresh. */
  onChanged: () => void;
}

type Sub = 'pay' | 'presence' | 'absence' | 'fee' | 'editSub' | 'renew' | 'edit' | null;
type Confirm =
  | { kind: 'sub'; row: AthleteSubscription }
  | { kind: 'fee'; row: ExtraFee }
  | { kind: 'att'; row: Attendance }
  | null;

interface HistoryRow {
  key: string;
  date: string;
  kind: 'subscription' | 'payment' | 'fee' | 'presence' | 'absence' | 'credit' | 'session';
  title: string;
  detail?: string;
  amount?: number;
  tone: 'in' | 'out' | 'neutral' | 'warn';
}

export const AthleteDetailsDialog: React.FC<Props> = ({ isOpen, onClose, athlete: initial, onChanged }) => {
  const { tr, fmtDate } = useLang();
  const { can } = usePermissions();

  const [athlete, setAthlete] = useState<Athlete | null>(initial);
  const [subs, setSubs] = useState<AthleteSubscription[]>([]);
  const [fees, setFees] = useState<ExtraFee[]>([]);
  const [payments, setPayments] = useState<AthletePayment[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [credits, setCredits] = useState<CreditRow[]>([]);
  const [seances, setSeances] = useState<SeanceHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('info');
  const [historyFilter, setHistoryFilter] = useState<'all' | HistoryRow['kind']>('all');

  const [sub, setSub] = useState<Sub>(null);
  const [editingSub, setEditingSub] = useState<AthleteSubscription | null>(null);
  const [editingFee, setEditingFee] = useState<ExtraFee | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);

  const load = useCallback(async () => {
    if (!initial) return;
    setLoading(true);
    // Each part loads on its own so one failing table never blanks the others.
    const safe = <T,>(p: Promise<T>, fallback: T) => p.catch(() => fallback);
    const [a, s, f, p, at, c, se] = await Promise.all([
      safe(getAthlete(initial.id), initial),
      safe(listAthleteSubscriptions(initial.id), [] as AthleteSubscription[]),
      safe(listExtraFees(initial.id), [] as ExtraFee[]),
      safe(listPayments(initial.id), [] as AthletePayment[]),
      safe(listAttendance(initial.id), [] as Attendance[]),
      safe(listCredits(initial.id), [] as CreditRow[]),
      safe(listSeanceHistory(initial.id), [] as SeanceHistory[]),
    ]);
    setAthlete(a ?? initial);
    setSubs(s); setFees(f); setPayments(p); setAttendance(at); setCredits(c); setSeances(se);
    setLoading(false);
  }, [initial]);

  useEffect(() => {
    if (isOpen) { setTab('info'); setHistoryFilter('all'); setAthlete(initial); load(); }
  }, [isOpen, initial, load]);

  const refresh = async () => { await load(); onChanged(); };

  const subDebt = subs.reduce((s, x) => s + Number(x.remaining || 0), 0);
  const feeDebt = fees.reduce((s, x) => s + Number(x.remaining || 0), 0);
  const totalDebt = subDebt + feeDebt;
  const left = athlete ? daysLeft(athlete.subscription_expiry) : null;
  const presentCount = attendance.filter((a) => a.status === 'present').length;
  const absentCount = attendance.filter((a) => a.status === 'absent').length;

  const history = useMemo<HistoryRow[]>(() => {
    const rows: HistoryRow[] = [
      ...subs.map((s) => ({
        key: `s-${s.id}`, date: s.payment_date, kind: 'subscription' as const,
        title: `${tr('Abonnement', 'اشتراك')} : ${s.name}`,
        detail: `${tr('Prix', 'السعر')} ${formatDZD(s.price)} · ${tr('Payé', 'مدفوع')} ${formatDZD(s.amount_paid)}${s.expiry_date ? ` · ${tr('Expire le', 'ينتهي في')} ${fmtDate(s.expiry_date)}` : ''}`,
        amount: Number(s.amount_paid), tone: 'in' as const,
      })),
      ...payments.map((p) => ({
        key: `p-${p.id}`, date: p.payment_date, kind: 'payment' as const,
        title: tr('Paiement de dette', 'تسديد دين'),
        detail: (p.allocations ?? []).map((a) => `${a.label} (${formatDZD(a.amount)})`).join(', ') || p.description || undefined,
        amount: Number(p.amount), tone: 'in' as const,
      })),
      ...fees.map((f) => ({
        key: `f-${f.id}`, date: f.fee_date, kind: 'fee' as const,
        title: `${tr('Frais supplémentaire', 'رسوم إضافية')} : ${f.name}`,
        detail: `${f.quantity} × ${formatDZD(f.unit_price)} = ${formatDZD(f.total)} · ${tr('Payé', 'مدفوع')} ${formatDZD(f.amount_paid)} · ${tr('Reste', 'الباقي')} ${formatDZD(f.remaining)}`,
        amount: Number(f.amount_paid), tone: 'in' as const,
      })),
      ...attendance.map((a) => ({
        key: `a-${a.id}`, date: a.att_date, kind: a.status === 'present' ? 'presence' as const : 'absence' as const,
        title: a.status === 'present' ? tr('Présence', 'حضور') : tr('Absence', 'غياب'),
        detail: `${a.att_time?.slice(0, 5) ?? ''} · ${a.source === 'scan' ? tr('Scan de carte', 'مسح البطاقة') : tr('Manuel', 'يدوي')}${a.notes ? ` · ${a.notes}` : ''}`,
        tone: a.status === 'present' ? 'neutral' as const : 'warn' as const,
      })),
      ...credits.map((c) => ({
        key: `c-${c.id}`, date: c.credit_date, kind: 'credit' as const,
        title: c.type === 'deposit' ? tr('Dépôt de crédit', 'إيداع رصيد') : tr('Crédit utilisé', 'رصيد مستخدم'),
        detail: c.description ?? undefined, amount: Number(c.amount),
        tone: c.type === 'deposit' ? 'in' as const : 'out' as const,
      })),
      ...seances.map((s) => ({
        key: `se-${s.id}`, date: s.used_at.slice(0, 10), kind: 'session' as const,
        title: tr('Séance utilisée', 'حصة مستخدمة'),
        detail: `${s.seances_remaining} ${tr('séance(s) restante(s)', 'حصة متبقية')}`, tone: 'neutral' as const,
      })),
    ];
    return rows.sort((a, b) => b.date.localeCompare(a.date));
  }, [subs, payments, fees, attendance, credits, seances, tr, fmtDate]);

  const visibleHistory = historyFilter === 'all' ? history : history.filter((h) => h.kind === historyFilter);

  const runConfirm = async () => {
    if (!confirm) return;
    try {
      if (confirm.kind === 'sub') await deleteAthleteSubscription(confirm.row);
      if (confirm.kind === 'fee') await deleteExtraFee(confirm.row);
      if (confirm.kind === 'att') await deleteAttendance(confirm.row.id);
      toast({ title: tr('Supprimé', 'تم الحذف') });
      setConfirm(null);
      await refresh();
    } catch (e) {
      toast({ title: tr('Suppression impossible', 'تعذر الحذف'), description: describeError(e), variant: 'destructive' });
    }
  };

  const openSub = (kind: Sub) => requestAnimationFrame(() => setSub(kind));

  if (!athlete) return null;

  const Section: React.FC<{ title: string; icon: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }> =
    ({ title, icon, action, children }) => (
      <div className="rounded-xl border border-gym-gold/15 bg-gym-black/30 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-gym-gold flex items-center gap-2">{icon}{title}</h3>
          {action}
        </div>
        {children}
      </div>
    );

  const Empty: React.FC<{ text: string }> = ({ text }) => (
    <p className="text-sm text-gym-gold/40 text-center py-6">{text}</p>
  );

  const InfoRow: React.FC<{ icon: React.ReactNode; label: string; value: React.ReactNode }> = ({ icon, label, value }) => (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-gym-black/40 border border-gym-gold/10">
      <div className="w-8 h-8 rounded-lg bg-gym-gold/10 text-gym-gold flex items-center justify-center shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-[11px] text-gym-gold/50">{label}</p>
        <p className="text-sm font-medium truncate">{value}</p>
      </div>
    </div>
  );

  const historyKinds: { key: 'all' | HistoryRow['kind']; label: string }[] = [
    { key: 'all', label: tr('Tout', 'الكل') },
    { key: 'subscription', label: tr('Abonnements', 'الاشتراكات') },
    { key: 'payment', label: tr('Paiements', 'المدفوعات') },
    { key: 'fee', label: tr('Frais', 'الرسوم') },
    { key: 'presence', label: tr('Présences', 'الحضور') },
    { key: 'absence', label: tr('Absences', 'الغياب') },
    { key: 'credit', label: tr('Crédit', 'الرصيد') },
    { key: 'session', label: tr('Séances', 'الحصص') },
  ];

  const toneClass = (t: HistoryRow['tone']) =>
    t === 'in' ? 'bg-green-500/15 text-green-400'
      : t === 'out' ? 'bg-red-500/15 text-red-400'
      : t === 'warn' ? 'bg-orange-500/15 text-orange-300'
      : 'bg-blue-500/15 text-blue-300';

  const kindIcon = (k: HistoryRow['kind']) => {
    const cls = 'w-4 h-4';
    switch (k) {
      case 'subscription': return <CalendarCheck className={cls} />;
      case 'payment': return <HandCoins className={cls} />;
      case 'fee': return <Receipt className={cls} />;
      case 'presence': return <UserCheck className={cls} />;
      case 'absence': return <UserX className={cls} />;
      case 'credit': return <Wallet className={cls} />;
      default: return <Clock className={cls} />;
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="bg-gym-gray border-gym-gold/25 text-gym-gold-light max-w-4xl max-h-[94vh] overflow-y-auto p-0">
          {/* Header */}
          <div className="relative bg-gradient-to-br from-gym-gold/25 via-gym-gold/5 to-transparent p-6 pb-4">
            <DialogHeader className="space-y-0">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="w-20 h-20 rounded-2xl ring-4 ring-gym-gold/30 bg-gym-black/50 flex items-center justify-center overflow-hidden shrink-0">
                  {athlete.photo_url
                    ? <img src={athlete.photo_url} alt="" className="w-full h-full object-cover" />
                    : <User className="w-9 h-9 text-gym-gold/50" />}
                </div>
                <div className="flex-1 min-w-0 text-start">
                  <DialogTitle className="text-2xl font-bold text-gym-gold">{athlete.full_name}</DialogTitle>
                  <DialogDescription className="text-gym-gold/60 flex flex-wrap items-center gap-2 mt-1">
                    {athlete.sports?.name && <span className="inline-flex items-center gap-1"><Dumbbell className="w-3.5 h-3.5" />{athlete.sports.name}</span>}
                    {athlete.phone && <span className="inline-flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{athlete.phone}</span>}
                  </DialogDescription>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {left === null ? (
                      <Badge variant="outline" className="border-gray-500/40 text-gray-300">{tr('Sans abonnement', 'بدون اشتراك')}</Badge>
                    ) : left < 0 ? (
                      <Badge variant="outline" className="border-red-500/50 text-red-300 bg-red-500/10">{tr('Expiré', 'منتهي')} · {fmtDate(athlete.subscription_expiry)}</Badge>
                    ) : (
                      <Badge variant="outline" className={cn(left <= 7 ? 'border-orange-500/50 text-orange-300 bg-orange-500/10' : 'border-green-500/50 text-green-300 bg-green-500/10')}>
                        {left} {tr('jour(s) restant(s)', 'يوم متبقٍ')}
                      </Badge>
                    )}
                    {totalDebt > 0 && (
                      <Badge variant="outline" className="border-red-500/50 text-red-300 bg-red-500/10">
                        {tr('Dette', 'دين')} : {formatDZD(totalDebt)}
                      </Badge>
                    )}
                    {athlete.account_balance > 0 && (
                      <Badge variant="outline" className="border-green-500/40 text-green-300">{tr('Crédit', 'رصيد')} : {formatDZD(athlete.account_balance)}</Badge>
                    )}
                  </div>
                </div>
              </div>
            </DialogHeader>

            {/* Actions */}
            <div className="flex flex-wrap gap-2 mt-4">
              {totalDebt > 0 && can('athletes', 'subscribe') && (
                <Button size="sm" onClick={() => openSub('pay')} className="bg-red-600 hover:bg-red-700 text-white">
                  <HandCoins className="w-4 h-4 me-1.5" />{tr('Payer la dette', 'تسديد الدين')}
                </Button>
              )}
              {can('athletes', 'subscribe') && (
                <Button size="sm" onClick={() => openSub('renew')} className="bg-gym-gold text-gym-black hover:bg-gym-gold/90">
                  <RefreshCw className="w-4 h-4 me-1.5" />{tr('Abonnement', 'اشتراك')}
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => openSub('presence')} className="border-green-500/40 text-green-300 hover:bg-green-500/10">
                <UserCheck className="w-4 h-4 me-1.5" />{tr('Présence', 'حضور')}
              </Button>
              <Button size="sm" variant="outline" onClick={() => openSub('absence')} className="border-orange-500/40 text-orange-300 hover:bg-orange-500/10">
                <UserX className="w-4 h-4 me-1.5" />{tr('Absence', 'غياب')}
              </Button>
              {can('athletes', 'edit') && (
                <>
                  <Button size="sm" variant="outline" onClick={() => { setEditingFee(null); openSub('fee'); }} className="border-blue-400/40 text-blue-300 hover:bg-blue-500/10">
                    <Receipt className="w-4 h-4 me-1.5" />{tr('Frais supplémentaire', 'رسوم إضافية')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openSub('edit')} className="border-gym-gold/40 text-gym-gold hover:bg-gym-gold/10">
                    <Pencil className="w-4 h-4 me-1.5" />{tr('Modifier', 'تعديل')}
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="p-6 pt-2">
            {loading && subs.length === 0 ? (
              <div className="py-16 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-gym-gold" /></div>
            ) : (
              <Tabs value={tab} onValueChange={setTab} className="space-y-4">
                <TabsList className="bg-gym-black/60 border border-gym-gold/20 flex flex-wrap h-auto gap-1 p-1">
                  {[
                    ['info', tr('Informations', 'المعلومات'), <Info key="i" className="w-4 h-4" />],
                    ['subs', `${tr('Abonnements', 'الاشتراكات')} (${subs.length})`, <CalendarCheck key="s" className="w-4 h-4" />],
                    ['presence', `${tr('Présences', 'الحضور')} (${attendance.length})`, <UserCheck key="p" className="w-4 h-4" />],
                    ['fees', `${tr('Frais supp.', 'الرسوم الإضافية')} (${fees.length})`, <Receipt key="f" className="w-4 h-4" />],
                    ['history', tr('Historique', 'السجل'), <History key="h" className="w-4 h-4" />],
                  ].map(([value, label, icon]) => (
                    <TabsTrigger key={value as string} value={value as string}
                                 className="gap-1.5 data-[state=active]:bg-gym-gold data-[state=active]:text-gym-black">
                      {icon}{label}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {/* ---- Informations ---- */}
                <TabsContent value="info" className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label: tr('Total payé', 'إجمالي المدفوع'), value: formatDZD(athlete.total_paid), tone: 'text-green-400' },
                      { label: tr('Dette totale', 'إجمالي الدين'), value: formatDZD(totalDebt), tone: totalDebt > 0 ? 'text-red-400' : 'text-green-400' },
                      { label: tr('Présences', 'الحضور'), value: presentCount, tone: 'text-blue-300' },
                      { label: tr('Absences', 'الغياب'), value: absentCount, tone: 'text-orange-300' },
                    ].map((k) => (
                      <div key={k.label} className="rounded-xl bg-gym-black/40 border border-gym-gold/15 p-3">
                        <p className="text-[11px] text-gym-gold/50">{k.label}</p>
                        <p className={cn('text-lg font-bold', k.tone)}>{k.value}</p>
                      </div>
                    ))}
                  </div>
                  <Section title={tr('Informations personnelles', 'المعلومات الشخصية')} icon={<User className="w-4 h-4" />}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <InfoRow icon={<Phone className="w-4 h-4" />} label={tr('Téléphone', 'الهاتف')} value={athlete.phone || '—'} />
                      <InfoRow icon={<Cake className="w-4 h-4" />} label={tr('Date de naissance', 'تاريخ الميلاد')} value={fmtDate(athlete.date_of_birth)} />
                      <InfoRow icon={<User className="w-4 h-4" />} label={tr('Sexe', 'الجنس')}
                               value={athlete.gender === 'male' ? tr('Homme', 'ذكر') : athlete.gender === 'female' ? tr('Femme', 'أنثى') : '—'} />
                      <InfoRow icon={<Dumbbell className="w-4 h-4" />} label={tr('Sport', 'الرياضة')} value={athlete.sports?.name || '—'} />
                      <InfoRow icon={<CalendarCheck className="w-4 h-4" />} label={tr('Expiration', 'الانتهاء')} value={fmtDate(athlete.subscription_expiry)} />
                      <InfoRow icon={<Coins className="w-4 h-4" />} label={tr('Dernier paiement', 'آخر دفع')} value={fmtDate(athlete.last_payment)} />
                      <InfoRow icon={<Wifi className="w-4 h-4" />} label={tr('Carte RFID', 'بطاقة RFID')} value={<span className="font-mono">{athlete.rfid_uid || '—'}</span>} />
                      <InfoRow icon={<Clock className="w-4 h-4" />} label={tr('Membre depuis', 'عضو منذ')} value={fmtDate(athlete.created_at)} />
                    </div>
                  </Section>
                  {totalDebt > 0 && (
                    <Section title={tr('Détail de la dette', 'تفاصيل الدين')} icon={<HandCoins className="w-4 h-4 text-red-400" />}>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3">
                          <p className="text-[11px] text-gym-gold/50">{tr('Abonnements', 'الاشتراكات')}</p>
                          <p className="font-bold text-red-300">{formatDZD(subDebt)}</p>
                        </div>
                        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3">
                          <p className="text-[11px] text-gym-gold/50">{tr('Frais supplémentaires', 'الرسوم الإضافية')}</p>
                          <p className="font-bold text-red-300">{formatDZD(feeDebt)}</p>
                        </div>
                      </div>
                    </Section>
                  )}
                </TabsContent>

                {/* ---- Subscriptions ---- */}
                <TabsContent value="subs">
                  <Section title={tr('Abonnements', 'الاشتراكات')} icon={<CalendarCheck className="w-4 h-4" />}
                           action={can('athletes', 'subscribe') && (
                             <Button size="sm" onClick={() => openSub('renew')} className="h-8 bg-gym-gold text-gym-black hover:bg-gym-gold/90">
                               <Plus className="w-4 h-4 me-1" />{tr('Ajouter', 'إضافة')}
                             </Button>
                           )}>
                    {subs.length === 0 ? <Empty text={tr('Aucun abonnement.', 'لا توجد اشتراكات.')} /> : (
                      <div className="space-y-2">
                        {subs.map((s) => {
                          const d = daysLeft(s.expiry_date);
                          return (
                            <div key={s.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-lg border border-gym-gold/15 bg-gym-gray/60">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="font-semibold truncate">{s.name}</p>
                                  {d !== null && (d < 0
                                    ? <Badge variant="outline" className="border-red-500/40 text-red-300 text-[10px] h-5">{tr('Expiré', 'منتهي')}</Badge>
                                    : <Badge variant="outline" className="border-green-500/40 text-green-300 text-[10px] h-5">{d} {tr('j restants', 'ي متبقية')}</Badge>)}
                                </div>
                                <p className="text-xs text-gym-gold/50">{fmtDate(s.payment_date)}{s.expiry_date && ` → ${fmtDate(s.expiry_date)}`}</p>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="text-end">
                                  <p className="text-xs">{formatDZD(s.amount_paid)} / {formatDZD(s.price)}</p>
                                  {s.remaining > 0
                                    ? <Badge variant="outline" className="border-red-500/40 text-red-400 text-[10px] h-5">{tr('Reste', 'الباقي')} {formatDZD(s.remaining)}</Badge>
                                    : <Badge variant="outline" className="border-green-500/40 text-green-400 text-[10px] h-5">{tr('Payé', 'مدفوع')}</Badge>}
                                </div>
                                {can('athletes', 'subscribe') && (
                                  <div className="flex gap-1">
                                    <Button size="icon" variant="ghost" className="h-8 w-8 text-gym-gold/70 hover:bg-gym-gold/10"
                                            onClick={() => { setEditingSub(s); openSub('editSub'); }} aria-label={tr('Modifier', 'تعديل')}>
                                      <Pencil className="w-4 h-4" />
                                    </Button>
                                    <Button size="icon" variant="ghost" className="h-8 w-8 text-red-400 hover:bg-red-500/10"
                                            onClick={() => setConfirm({ kind: 'sub', row: s })} aria-label={tr('Supprimer', 'حذف')}>
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </Section>
                </TabsContent>

                {/* ---- Attendance ---- */}
                <TabsContent value="presence">
                  <Section title={tr('Présences et absences', 'الحضور والغياب')} icon={<UserCheck className="w-4 h-4" />}
                           action={
                             <div className="flex gap-2">
                               <Button size="sm" onClick={() => openSub('presence')} className="h-8 bg-green-600 hover:bg-green-700 text-white">
                                 <UserCheck className="w-4 h-4 me-1" />{tr('Présent', 'حاضر')}
                               </Button>
                               <Button size="sm" onClick={() => openSub('absence')} className="h-8 bg-orange-600 hover:bg-orange-700 text-white">
                                 <UserX className="w-4 h-4 me-1" />{tr('Absent', 'غائب')}
                               </Button>
                             </div>
                           }>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-3 text-center">
                        <p className="text-2xl font-bold text-green-400">{presentCount}</p>
                        <p className="text-xs text-gym-gold/60">{tr('Présences', 'الحضور')}</p>
                      </div>
                      <div className="rounded-lg bg-orange-500/10 border border-orange-500/20 p-3 text-center">
                        <p className="text-2xl font-bold text-orange-300">{absentCount}</p>
                        <p className="text-xs text-gym-gold/60">{tr('Absences', 'الغياب')}</p>
                      </div>
                    </div>
                    {attendance.length === 0 ? <Empty text={tr('Aucune présence enregistrée.', 'لا يوجد حضور مسجل.')} /> : (
                      <div className="space-y-1.5 max-h-80 overflow-y-auto pe-1">
                        {attendance.map((a) => (
                          <div key={a.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-gym-gold/10">
                            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                              a.status === 'present' ? 'bg-green-500/15 text-green-400' : 'bg-orange-500/15 text-orange-300')}>
                              {a.status === 'present' ? <UserCheck className="w-4 h-4" /> : <UserX className="w-4 h-4" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">{a.status === 'present' ? tr('Présent', 'حاضر') : tr('Absent', 'غائب')}</p>
                              <p className="text-[11px] text-gym-gold/50">
                                {fmtDate(a.att_date)} · {a.att_time?.slice(0, 5)} · {a.source === 'scan' ? tr('Scan', 'مسح') : tr('Manuel', 'يدوي')}
                                {a.notes && ` · ${a.notes}`}
                              </p>
                            </div>
                            {can('athletes', 'edit') && (
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400 hover:bg-red-500/10"
                                      onClick={() => setConfirm({ kind: 'att', row: a })} aria-label={tr('Supprimer', 'حذف')}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </Section>
                </TabsContent>

                {/* ---- Extra fees ---- */}
                <TabsContent value="fees">
                  <Section title={tr('Frais supplémentaires', 'الرسوم الإضافية')} icon={<Receipt className="w-4 h-4" />}
                           action={can('athletes', 'edit') && (
                             <Button size="sm" onClick={() => { setEditingFee(null); openSub('fee'); }} className="h-8 bg-gym-gold text-gym-black hover:bg-gym-gold/90">
                               <Plus className="w-4 h-4 me-1" />{tr('Ajouter', 'إضافة')}
                             </Button>
                           )}>
                    {fees.length === 0 ? <Empty text={tr('Aucun frais supplémentaire.', 'لا توجد رسوم إضافية.')} /> : (
                      <div className="space-y-2">
                        {fees.map((f) => (
                          <div key={f.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-lg border border-gym-gold/15 bg-gym-gray/60">
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold truncate flex items-center gap-1.5">
                                {f.product_id && <Package className="w-4 h-4 text-blue-300 shrink-0" />}{f.name}
                              </p>
                              {f.description && <p className="text-xs text-gym-gold/60">{f.description}</p>}
                              <p className="text-[11px] text-gym-gold/50">{fmtDate(f.fee_date)} · {f.quantity} × {formatDZD(f.unit_price)}</p>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-end">
                                <p className="text-sm font-semibold">{formatDZD(f.total)}</p>
                                <p className="text-[11px] text-green-400">{tr('Payé', 'مدفوع')} {formatDZD(f.amount_paid)}</p>
                                {f.remaining > 0 && <p className="text-[11px] text-red-300">{tr('Reste', 'الباقي')} {formatDZD(f.remaining)}</p>}
                              </div>
                              {can('athletes', 'edit') && (
                                <div className="flex gap-1">
                                  <Button size="icon" variant="ghost" className="h-8 w-8 text-gym-gold/70 hover:bg-gym-gold/10"
                                          onClick={() => { setEditingFee(f); openSub('fee'); }} aria-label={tr('Modifier', 'تعديل')}>
                                    <Pencil className="w-4 h-4" />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-8 w-8 text-red-400 hover:bg-red-500/10"
                                          onClick={() => setConfirm({ kind: 'fee', row: f })} aria-label={tr('Supprimer', 'حذف')}>
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Section>
                </TabsContent>

                {/* ---- History ---- */}
                <TabsContent value="history">
                  <Section title={tr('Historique des transactions', 'سجل المعاملات')} icon={<History className="w-4 h-4" />}>
                    <div className="flex flex-wrap gap-1.5">
                      {historyKinds.map((k) => (
                        <button key={k.key} type="button" onClick={() => setHistoryFilter(k.key)}
                                className={cn('px-3 py-1 rounded-full text-xs border transition-colors',
                                  historyFilter === k.key ? 'bg-gym-gold text-gym-black border-gym-gold' : 'border-gym-gold/25 text-gym-gold/70 hover:bg-gym-gold/10')}>
                          {k.label}
                        </button>
                      ))}
                    </div>
                    {visibleHistory.length === 0 ? <Empty text={tr('Aucune opération.', 'لا توجد عمليات.')} /> : (
                      <div className="relative space-y-2 max-h-[420px] overflow-y-auto pe-1">
                        {visibleHistory.map((h) => (
                          <div key={h.key} className="flex items-start gap-3 p-3 rounded-lg border border-gym-gold/10 hover:border-gym-gold/25 transition-colors">
                            <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', toneClass(h.tone))}>{kindIcon(h.kind)}</div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">{h.title}</p>
                              {h.detail && <p className="text-[11px] text-gym-gold/50 break-words">{h.detail}</p>}
                            </div>
                            <div className="text-end shrink-0">
                              {h.amount !== undefined && (
                                <p className={cn('text-sm font-semibold', h.tone === 'out' ? 'text-red-400' : 'text-green-400')}>
                                  {h.tone === 'out' ? '−' : '+'}{formatDZD(h.amount)}
                                </p>
                              )}
                              <p className="text-[11px] text-gym-gold/40">{fmtDate(h.date)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Section>
                </TabsContent>
              </Tabs>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Sub-dialogs */}
      <PayDebtDialog isOpen={sub === 'pay'} onClose={() => setSub(null)} athlete={athlete} onSaved={refresh} />
      <AttendanceDialog isOpen={sub === 'presence' || sub === 'absence'} onClose={() => setSub(null)} athlete={athlete}
                        initialStatus={sub === 'absence' ? 'absent' : 'present'} onSaved={refresh} />
      <ExtraFeeDialog isOpen={sub === 'fee'} onClose={() => setSub(null)} athlete={athlete} fee={editingFee} onSaved={refresh} />
      <EditSubscriptionDialog isOpen={sub === 'editSub'} onClose={() => setSub(null)} subscription={editingSub} onSaved={refresh} />
      <SubscriptionDialog isOpen={sub === 'renew'} onClose={() => setSub(null)} athlete={athlete} onSaved={refresh} mode="renew" />
      <AthleteFormDialog isOpen={sub === 'edit'} onClose={() => setSub(null)} athlete={athlete} onSaved={refresh}
                         canSubscribe={can('athletes', 'subscribe')} />

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent className="bg-gym-gray border-gym-gold/20 text-gym-gold-light">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gym-gold">
              {confirm?.kind === 'sub' ? tr('Supprimer cet abonnement ?', 'حذف هذا الاشتراك؟')
                : confirm?.kind === 'fee' ? tr('Supprimer ce frais ?', 'حذف هذه الرسوم؟')
                : tr('Supprimer cette présence ?', 'حذف هذا السجل؟')}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gym-gold/60">
              {confirm?.kind === 'sub' && `${confirm.row.name} — ${formatDZD(confirm.row.price)}`}
              {confirm?.kind === 'fee' && `${confirm.row.name} — ${formatDZD(confirm.row.total)}${confirm.row.product_id ? ` · ${tr('La quantité sera remise en stock.', 'ستُعاد الكمية إلى المخزون.')}` : ''}`}
              {confirm?.kind === 'att' && fmtDate(confirm.row.att_date)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10">{tr('Annuler', 'إلغاء')}</AlertDialogCancel>
            <AlertDialogAction onClick={runConfirm} className="bg-red-600 text-white hover:bg-red-700">{tr('Supprimer', 'حذف')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
