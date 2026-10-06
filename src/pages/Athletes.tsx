import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Search, Plus, User, Phone, Users, Zap, CalendarCheck, Wallet, Pencil, Trash2,
  MoreVertical, Dumbbell, UserCheck, AlertCircle, RefreshCw, Eye, HandCoins, UserX,
  Receipt, X, AlertTriangle, CalendarClock,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { formatDZD, cn } from '@/lib/utils';
import { describeError } from '@/lib/supabase';
import { usePermissions } from '@/contexts/AuthContext';
import { useLang } from '@/hooks/useLang';
import { ViewToggle, ViewMode } from '@/components/common/ViewToggle';
import { Athlete, Sport, listAthletes, listSports, deleteAthlete } from '@/lib/api/athletes';
import { debtByAthlete } from '@/lib/api/athleteExtras';
import { AthleteFormDialog } from '@/components/athletes/AthleteFormDialog';
import { SubscriptionDialog } from '@/components/athletes/SubscriptionDialog';
import { CreditDialog } from '@/components/athletes/CreditDialog';
import { FreeSessionDialog } from '@/components/athletes/FreeSessionDialog';
import { AthleteDetailsDialog } from '@/components/athletes/AthleteDetailsDialog';
import { PayDebtDialog } from '@/components/athletes/PayDebtDialog';
import { AttendanceDialog } from '@/components/athletes/AttendanceDialog';
import { ExtraFeeDialog } from '@/components/athletes/ExtraFeeDialog';
import { athleteState, daysLeft, AthleteState } from '@/components/athletes/athleteStatus';

type DialogKind = 'form' | 'subscription' | 'credit' | 'freeSession' | 'details' | 'pay'
  | 'presence' | 'absence' | 'fee' | null;
type Filter = 'all' | 'active' | 'expiring' | 'expired' | 'debt';

const ALERT_KEY = 'gym.athletes.hiddenAlerts';
const readHidden = (): string[] => {
  try { return JSON.parse(sessionStorage.getItem(ALERT_KEY) ?? '[]'); } catch { return []; }
};

export const Athletes: React.FC = () => {
  const { can } = usePermissions();
  const { t, tr, fmtDate } = useLang();

  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [debts, setDebts] = useState<Record<string, number>>({});
  const [sports, setSports] = useState<Sport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sportFilter, setSportFilter] = useState('all');
  const [view, setView] = useState<ViewMode>('cards');
  const [hiddenAlerts, setHiddenAlerts] = useState<string[]>(readHidden);

  const [dialog, setDialog] = useState<DialogKind>(null);
  const [selected, setSelected] = useState<Athlete | null>(null);
  const [subMode, setSubMode] = useState<'assign' | 'renew'>('assign');
  const [toDelete, setToDelete] = useState<Athlete | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [a, s, d] = await Promise.all([listAthletes(), listSports(), debtByAthlete().catch(() => ({}))]);
      setAthletes(a);
      setSports(s);
      setDebts(d);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const hideAlert = (key: string) => {
    const next = [...hiddenAlerts, key];
    setHiddenAlerts(next);
    try { sessionStorage.setItem(ALERT_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };

  // Defer the dialog open by a frame so a closing dropdown never races the dialog's focus lock.
  const open = (kind: Exclude<DialogKind, null>, athlete: Athlete | null, mode: 'assign' | 'renew' = 'assign') => {
    setSelected(athlete);
    setSubMode(mode);
    requestAnimationFrame(() => setDialog(kind));
  };
  const close = () => setDialog(null);

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await deleteAthlete(toDelete.id);
      toast({ title: t('athX.deleted'), description: toDelete.full_name });
      setToDelete(null);
      await load();
    } catch (e) {
      toast({ title: t('common.error'), description: describeError(e), variant: 'destructive' });
    }
  };

  const debtOf = (a: Athlete) => debts[a.id] ?? 0;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return athletes.filter((a) => {
      const matchesSearch = !q || a.full_name.toLowerCase().includes(q)
        || (a.phone ?? '').toLowerCase().includes(q) || (a.rfid_uid ?? '').toLowerCase().includes(q);
      const st = athleteState(a);
      const matchesFilter = filter === 'all'
        || (filter === 'active' && (st === 'active' || st === 'expiring'))
        || (filter === 'expiring' && st === 'expiring')
        || (filter === 'expired' && (st === 'expired' || st === 'none'))
        || (filter === 'debt' && (debts[a.id] ?? 0) > 0);
      const matchesSport = sportFilter === 'all' || a.sport_id === sportFilter;
      return matchesSearch && matchesFilter && matchesSport;
    });
  }, [athletes, search, filter, sportFilter, debts]);

  const expiredList = useMemo(() => athletes.filter((a) => athleteState(a) === 'expired'), [athletes]);
  const expiringList = useMemo(() => athletes.filter((a) => athleteState(a) === 'expiring'), [athletes]);
  const debtList = useMemo(() => athletes.filter((a) => (debts[a.id] ?? 0) > 0)
    .sort((a, b) => (debts[b.id] ?? 0) - (debts[a.id] ?? 0)), [athletes, debts]);
  const totalDebt = useMemo(() => Object.values(debts).reduce((s, v) => s + v, 0), [debts]);

  const stats = {
    total: athletes.length,
    active: athletes.filter((a) => ['active', 'expiring'].includes(athleteState(a))).length,
    expired: expiredList.length,
    debtors: debtList.length,
  };

  const athleteOptions = useMemo(() => athletes.map((a) => ({ id: a.id, full_name: a.full_name })), [athletes]);
  const sportName = (a: Athlete) => a.sports?.name ?? sports.find((s) => s.id === a.sport_id)?.name;

  const stateBadge = (st: AthleteState, d: number | null) => {
    const map: Record<AthleteState, { cls: string; label: string }> = {
      active: { cls: 'border-green-500/40 text-green-300 bg-green-500/10', label: tr('Actif', 'نشط') },
      expiring: { cls: 'border-orange-500/40 text-orange-300 bg-orange-500/10', label: tr('Expire bientôt', 'ينتهي قريبًا') },
      expired: { cls: 'border-red-500/40 text-red-300 bg-red-500/10', label: tr('Expiré', 'منتهي') },
      none: { cls: 'border-gray-500/40 text-gray-300 bg-gray-500/10', label: tr('Sans abonnement', 'بدون اشتراك') },
    };
    const m = map[st];
    return <Badge variant="outline" className={cn('text-[10px] h-5 whitespace-nowrap', m.cls)}>{m.label}{st === 'expired' && d !== null ? ` (${-d} ${tr('j', 'ي')})` : ''}</Badge>;
  };

  const menuFor = (a: Athlete) => ([
    { key: 'details', label: tr('Voir les détails', 'عرض التفاصيل'), icon: Eye, run: () => open('details', a), ok: true },
    { key: 'pay', label: tr('Payer la dette', 'تسديد الدين'), icon: HandCoins, run: () => open('pay', a), ok: debtOf(a) > 0 && can('athletes', 'subscribe') },
    { key: 'sub', label: tr('Abonnement', 'اشتراك'), icon: CalendarCheck, run: () => open('subscription', a, 'assign'), ok: can('athletes', 'subscribe') },
    { key: 'presence', label: tr('Marquer présent', 'تسجيل حضور'), icon: UserCheck, run: () => open('presence', a), ok: true },
    { key: 'absence', label: tr('Marquer absent', 'تسجيل غياب'), icon: UserX, run: () => open('absence', a), ok: true },
    { key: 'fee', label: tr('Frais supplémentaire', 'رسوم إضافية'), icon: Receipt, run: () => open('fee', a), ok: can('athletes', 'edit') },
    { key: 'credit', label: t('athX.addCredit'), icon: Wallet, run: () => open('credit', a), ok: can('athletes', 'credit') },
    { key: 'edit', label: tr('Modifier', 'تعديل'), icon: Pencil, run: () => open('form', a), ok: can('athletes', 'edit') },
  ].filter((m) => m.ok));

  const ActionsMenu: React.FC<{ athlete: Athlete }> = ({ athlete }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="h-8 w-8 text-gym-gold/70 hover:text-gym-gold hover:bg-gym-gold/10"
                aria-label={tr('Actions', 'الإجراءات')}>
          <MoreVertical className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-gym-gray border-gym-gold/30 text-gym-gold-light">
        {menuFor(athlete).map((m) => (
          <DropdownMenuItem key={m.key} onSelect={m.run} className="cursor-pointer focus:bg-gym-gold/15 focus:text-gym-gold">
            <m.icon className="w-4 h-4 me-2" />{m.label}
          </DropdownMenuItem>
        ))}
        {can('athletes', 'delete') && (
          <>
            <DropdownMenuSeparator className="bg-gym-gold/20" />
            <DropdownMenuItem onSelect={() => requestAnimationFrame(() => setToDelete(athlete))}
                              className="cursor-pointer text-red-400 focus:bg-red-500/10 focus:text-red-400">
              <Trash2 className="w-4 h-4 me-2" />{tr('Supprimer', 'حذف')}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  /** Remaining-days progress, assuming a 30-day plan for the bar scale. */
  const DaysBar: React.FC<{ a: Athlete }> = ({ a }) => {
    const d = daysLeft(a.subscription_expiry);
    if (d === null) return <p className="text-xs text-gym-gold/40">{tr('Aucun abonnement', 'لا يوجد اشتراك')}</p>;
    const pct = d <= 0 ? 0 : Math.min(100, (d / 30) * 100);
    const tone = d < 0 ? 'bg-red-500' : d <= 7 ? 'bg-orange-400' : 'bg-green-500';
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gym-gold/60 flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" />{fmtDate(a.subscription_expiry)}</span>
          <span className={cn('font-bold', d < 0 ? 'text-red-400' : d <= 7 ? 'text-orange-300' : 'text-green-400')}>
            {d < 0 ? tr('Expiré', 'منتهي') : `${d} ${tr('jours restants', 'يوم متبقٍ')}`}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-gym-black overflow-hidden">
          <div className={cn('h-full rounded-full transition-all', tone)} style={{ width: `${d < 0 ? 100 : Math.max(pct, 4)}%` }} />
        </div>
      </div>
    );
  };

  const filterChips: { key: Filter; label: string; count: number; tone: string }[] = [
    { key: 'all', label: tr('Tous', 'الكل'), count: stats.total, tone: 'gym' },
    { key: 'active', label: tr('Actifs', 'النشطون'), count: stats.active, tone: 'green' },
    { key: 'expiring', label: tr('Expirent bientôt', 'تنتهي قريبًا'), count: expiringList.length, tone: 'orange' },
    { key: 'expired', label: tr('Expirés', 'المنتهية'), count: stats.expired, tone: 'red' },
    { key: 'debt', label: tr('Avec dette', 'لديهم ديون'), count: stats.debtors, tone: 'red' },
  ];

  const showExpiredAlert = expiredList.length > 0 && !hiddenAlerts.includes('expired');
  const showDebtAlert = debtList.length > 0 && !hiddenAlerts.includes('debt');

  return (
    <div className="min-h-screen bg-gym-black text-gym-gold-light p-0 md:p-2">
      <div className="max-w-7xl mx-auto space-y-4 md:space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 animate-fade-in">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold gradient-text">{tr('Athlètes', 'الرياضيون')}</h1>
            <p className="text-gym-gold/60 mt-1">{tr('Membres, abonnements, présences et dettes.', 'الأعضاء والاشتراكات والحضور والديون.')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ViewToggle mode={view} onChange={setView} cardsLabel={tr('Cartes', 'بطاقات')} tableLabel={tr('Tableau', 'جدول')} />
            {can('athletes', 'free_session') && (
              <Button variant="outline" onClick={() => open('freeSession', null)} className="border-gym-gold/40 text-gym-gold hover:bg-gym-gold/10">
                <Zap className="w-4 h-4 me-2" />{tr('Séance libre', 'حصة حرة')}
              </Button>
            )}
            {can('athletes', 'edit') && (
              <Button variant="outline" onClick={() => open('fee', null)} className="border-blue-400/40 text-blue-300 hover:bg-blue-500/10">
                <Receipt className="w-4 h-4 me-2" />{tr('Frais supplémentaire', 'رسوم إضافية')}
              </Button>
            )}
            {can('athletes', 'create') && (
              <Button onClick={() => open('form', null)} className="bg-gym-gold text-gym-black hover:bg-gym-gold/90 shadow-lg shadow-gym-gold/10">
                <Plus className="w-4 h-4 me-2" />{tr('Nouvel athlète', 'رياضي جديد')}
              </Button>
            )}
          </div>
        </div>

        {/* Alerts (dismissible for this session) */}
        {!loading && (showExpiredAlert || showDebtAlert) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {showExpiredAlert && (
              <div className="relative rounded-xl border border-red-500/30 bg-gradient-to-br from-red-500/15 to-transparent p-4 animate-fade-in">
                <button onClick={() => hideAlert('expired')} className="absolute top-2 end-2 p-1 rounded-md text-red-200/60 hover:text-red-100 hover:bg-red-500/20"
                        aria-label={tr('Masquer', 'إخفاء')}><X className="w-4 h-4" /></button>
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                  <p className="font-semibold text-red-200">
                    {expiredList.length} {tr('abonnement(s) expiré(s)', 'اشتراك منتهي')}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {expiredList.slice(0, 8).map((a) => (
                    <button key={a.id} onClick={() => open('details', a)}
                            className="text-xs px-2 py-1 rounded-full bg-red-500/15 text-red-200 hover:bg-red-500/30">
                      {a.full_name}
                    </button>
                  ))}
                  {expiredList.length > 8 && (
                    <button onClick={() => setFilter('expired')} className="text-xs px-2 py-1 rounded-full text-red-200 underline">
                      +{expiredList.length - 8} {tr('autres', 'آخرين')}
                    </button>
                  )}
                </div>
              </div>
            )}
            {showDebtAlert && (
              <div className="relative rounded-xl border border-orange-500/30 bg-gradient-to-br from-orange-500/15 to-transparent p-4 animate-fade-in">
                <button onClick={() => hideAlert('debt')} className="absolute top-2 end-2 p-1 rounded-md text-orange-200/60 hover:text-orange-100 hover:bg-orange-500/20"
                        aria-label={tr('Masquer', 'إخفاء')}><X className="w-4 h-4" /></button>
                <div className="flex items-center gap-2 mb-2">
                  <HandCoins className="w-5 h-5 text-orange-300" />
                  <p className="font-semibold text-orange-100">
                    {debtList.length} {tr('athlète(s) avec dette', 'رياضي عليه دين')} · {formatDZD(totalDebt)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {debtList.slice(0, 8).map((a) => (
                    <button key={a.id} onClick={() => open('pay', a)}
                            className="text-xs px-2 py-1 rounded-full bg-orange-500/15 text-orange-100 hover:bg-orange-500/30">
                      {a.full_name} · {formatDZD(debtOf(a))}
                    </button>
                  ))}
                  {debtList.length > 8 && (
                    <button onClick={() => setFilter('debt')} className="text-xs px-2 py-1 rounded-full text-orange-100 underline">
                      +{debtList.length - 8} {tr('autres', 'آخرين')}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { icon: Users, label: tr('Total athlètes', 'إجمالي الرياضيين'), value: stats.total, tone: 'from-gym-gold/20 text-gym-gold' },
            { icon: UserCheck, label: tr('Actifs', 'النشطون'), value: stats.active, tone: 'from-green-500/20 text-green-400' },
            { icon: AlertCircle, label: tr('Expirés', 'المنتهية'), value: stats.expired, tone: 'from-red-500/20 text-red-400' },
            { icon: HandCoins, label: tr('Dettes totales', 'إجمالي الديون'), value: formatDZD(totalDebt), tone: 'from-orange-500/20 text-orange-300' },
          ].map((s) => (
            <Card key={s.label} className={cn('border-gym-gold/15 bg-gradient-to-br to-gym-gray hover-lift', s.tone.split(' ')[0])}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={cn('w-11 h-11 rounded-xl bg-gym-black/40 flex items-center justify-center shrink-0', s.tone.split(' ')[1])}>
                  <s.icon className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gym-gold/60">{s.label}</p>
                  <p className="text-xl font-bold text-gym-gold truncate">{s.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <Card className="bg-gym-gray border-gym-gold/20">
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 text-gym-gold/50 w-4 h-4" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)}
                       placeholder={tr('Rechercher par nom, téléphone ou carte…', 'ابحث بالاسم أو الهاتف أو البطاقة…')}
                       className="ps-10 bg-gym-black border-gym-gold/30 text-gym-gold-light" />
              </div>
              <Select value={sportFilter} onValueChange={setSportFilter}>
                <SelectTrigger className="w-full md:w-48 bg-gym-black border-gym-gold/30 text-gym-gold-light"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-gym-gray border-gym-gold/30 text-gym-gold-light">
                  <SelectItem value="all">{tr('Tous les sports', 'كل الرياضات')}</SelectItem>
                  {sports.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap gap-2">
              {filterChips.map((c) => (
                <button key={c.key} onClick={() => setFilter(c.key)}
                        className={cn('inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm border transition-all',
                          filter === c.key
                            ? 'bg-gym-gold text-gym-black border-gym-gold font-semibold'
                            : 'border-gym-gold/25 text-gym-gold/70 hover:bg-gym-gold/10')}>
                  {c.key === 'debt' && <HandCoins className="w-3.5 h-3.5" />}
                  {c.label}
                  <span className={cn('text-[11px] px-1.5 rounded-full', filter === c.key ? 'bg-gym-black/20' : 'bg-gym-gold/10')}>{c.count}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Content */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <Card key={i} className="bg-gym-gray border-gym-gold/20 animate-pulse"><CardContent className="p-5 h-64" /></Card>
            ))}
          </div>
        ) : error ? (
          <Card className="bg-gym-gray border-red-500/30">
            <CardContent className="p-8 text-center space-y-3">
              <p className="text-red-400 font-medium">{tr('Impossible de charger les athlètes', 'تعذر تحميل الرياضيين')}</p>
              <p className="text-sm text-gym-gold/50">{error}</p>
              <Button variant="outline" onClick={load} className="border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10">{tr('Réessayer', 'إعادة المحاولة')}</Button>
            </CardContent>
          </Card>
        ) : filtered.length === 0 ? (
          <Card className="bg-gym-gray border-gym-gold/20">
            <CardContent className="p-12 text-center space-y-2">
              <Users className="w-10 h-10 text-gym-gold/25 mx-auto" />
              <p className="text-gym-gold/60">
                {athletes.length === 0 ? tr('Aucun athlète pour le moment.', 'لا يوجد رياضيون بعد.') : tr('Aucun athlète ne correspond.', 'لا يوجد رياضي مطابق.')}
              </p>
              {athletes.length === 0 && can('athletes', 'create') && (
                <Button onClick={() => open('form', null)} className="gym-button mt-2">
                  <Plus className="w-4 h-4 me-2" />{tr('Ajouter le premier athlète', 'أضف أول رياضي')}
                </Button>
              )}
            </CardContent>
          </Card>
        ) : view === 'table' ? (
          <Card className="bg-gym-gray border-gym-gold/20 overflow-hidden animate-fade-in">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-gym-gold/20 hover:bg-transparent">
                    <TableHead className="text-gym-gold/70 text-start">{tr('Nom', 'الاسم')}</TableHead>
                    <TableHead className="text-gym-gold/70 text-start">{tr('Téléphone', 'الهاتف')}</TableHead>
                    <TableHead className="text-gym-gold/70 text-start">{tr('Sport', 'الرياضة')}</TableHead>
                    <TableHead className="text-gym-gold/70 text-start">{tr('Statut', 'الحالة')}</TableHead>
                    <TableHead className="text-gym-gold/70 text-start">{tr('Jours restants', 'الأيام المتبقية')}</TableHead>
                    <TableHead className="text-gym-gold/70 text-end">{tr('Dette', 'الدين')}</TableHead>
                    <TableHead className="text-gym-gold/70 text-end">{tr('Actions', 'الإجراءات')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((a) => {
                    const d = daysLeft(a.subscription_expiry);
                    const debt = debtOf(a);
                    return (
                      <TableRow key={a.id} className="border-gym-gold/10 hover:bg-gym-gold/5">
                        <TableCell>
                          <button onClick={() => open('details', a)} className="flex items-center gap-3 text-start">
                            <div className="w-9 h-9 rounded-full bg-gym-gold/15 flex items-center justify-center overflow-hidden shrink-0">
                              {a.photo_url ? <img src={a.photo_url} alt="" className="w-full h-full object-cover" /> : <User className="w-4 h-4 text-gym-gold/50" />}
                            </div>
                            <span className="font-medium text-gym-gold hover:underline">{a.full_name}</span>
                          </button>
                        </TableCell>
                        <TableCell className="text-gym-gold/60 text-sm">{a.phone || '—'}</TableCell>
                        <TableCell className="text-gym-gold/60 text-sm">{sportName(a) || '—'}</TableCell>
                        <TableCell>{stateBadge(athleteState(a), d)}</TableCell>
                        <TableCell className={cn('text-sm font-semibold', d === null ? 'text-gym-gold/40' : d < 0 ? 'text-red-400' : d <= 7 ? 'text-orange-300' : 'text-green-400')}>
                          {d === null ? '—' : d < 0 ? tr('Expiré', 'منتهي') : d}
                        </TableCell>
                        <TableCell className="text-end text-sm">
                          {debt > 0 ? <span className="text-red-400 font-semibold">{formatDZD(debt)}</span> : <span className="text-gym-gold/30">—</span>}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => open('details', a)} className="h-8 text-gym-gold hover:bg-gym-gold/10">
                              <Eye className="w-4 h-4" />
                            </Button>
                            {debt > 0 && can('athletes', 'subscribe') && (
                              <Button size="sm" onClick={() => open('pay', a)} className="h-8 bg-red-600 hover:bg-red-700 text-white">
                                <HandCoins className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            <ActionsMenu athlete={a} />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((a, i) => {
              const st = athleteState(a);
              const d = daysLeft(a.subscription_expiry);
              const debt = debtOf(a);
              const banner = st === 'expired' ? 'from-red-600/40 via-red-500/10'
                : st === 'expiring' ? 'from-orange-500/40 via-orange-400/10'
                : st === 'none' ? 'from-gray-500/30 via-gray-500/5'
                : 'from-emerald-500/35 via-gym-gold/10';
              return (
                <Card key={a.id} style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
                      className={cn('bg-gym-gray border-gym-gold/15 hover:border-gym-gold/50 hover:shadow-xl hover:shadow-gym-gold/5 hover:-translate-y-0.5 transition-all overflow-hidden animate-fade-in',
                        debt > 0 && 'ring-1 ring-red-500/40')}>
                  <CardContent className="p-0">
                    <div className={cn('h-20 bg-gradient-to-br to-transparent relative', banner)}>
                      <div className="absolute top-2 start-3">{stateBadge(st, d)}</div>
                      <div className="absolute top-1.5 end-1.5"><ActionsMenu athlete={a} /></div>
                      <button onClick={() => open('details', a)}
                              className="absolute -bottom-9 start-4 w-[4.5rem] h-[4.5rem] rounded-2xl ring-4 ring-gym-gray bg-gym-black flex items-center justify-center overflow-hidden">
                        {a.photo_url ? <img src={a.photo_url} alt="" className="w-full h-full object-cover" /> : <User className="w-8 h-8 text-gym-gold/40" />}
                      </button>
                    </div>

                    <div className="pt-11 px-4 pb-4 space-y-3">
                      <div className="min-w-0">
                        <h3 className="font-bold text-gym-gold truncate text-lg leading-tight">{a.full_name}</h3>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gym-gold/55 mt-1">
                          {sportName(a) && <span className="inline-flex items-center gap-1"><Dumbbell className="w-3 h-3" />{sportName(a)}</span>}
                          <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{a.phone || '—'}</span>
                        </div>
                      </div>

                      <DaysBar a={a} />

                      {debt > 0 ? (
                        <div className="flex items-center justify-between rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2">
                          <span className="flex items-center gap-1.5 text-xs text-red-200"><AlertTriangle className="w-3.5 h-3.5" />{tr('Dette', 'دين')}</span>
                          <span className="text-sm font-bold text-red-300">{formatDZD(debt)}</span>
                        </div>
                      ) : a.account_balance > 0 ? (
                        <div className="flex items-center justify-between rounded-lg bg-green-500/10 border border-green-500/20 px-3 py-2">
                          <span className="text-xs text-green-200">{tr('Crédit', 'رصيد')}</span>
                          <span className="text-sm font-bold text-green-300">{formatDZD(a.account_balance)}</span>
                        </div>
                      ) : null}

                      <div className="grid grid-cols-2 gap-2">
                        <Button size="sm" variant="outline" onClick={() => open('details', a)}
                                className="border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10">
                          <Eye className="w-3.5 h-3.5 me-1.5" />{tr('Détails', 'التفاصيل')}
                        </Button>
                        {debt > 0 && can('athletes', 'subscribe') ? (
                          <Button size="sm" onClick={() => open('pay', a)} className="bg-red-600 hover:bg-red-700 text-white">
                            <HandCoins className="w-3.5 h-3.5 me-1.5" />{tr('Payer', 'تسديد')}
                          </Button>
                        ) : can('athletes', 'subscribe') ? (
                          <Button size="sm" onClick={() => open('subscription', a, st === 'expired' || st === 'none' ? 'renew' : 'assign')}
                                  className="bg-gym-gold text-gym-black hover:bg-gym-gold/90 font-semibold">
                            <RefreshCw className="w-3.5 h-3.5 me-1.5" />{st === 'expired' ? tr('Renouveler', 'تجديد') : tr('Abonnement', 'اشتراك')}
                          </Button>
                        ) : <span />}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Dialogs */}
      <AthleteFormDialog isOpen={dialog === 'form'} onClose={close} athlete={selected} onSaved={load}
                         canSubscribe={can('athletes', 'subscribe')} />
      <SubscriptionDialog isOpen={dialog === 'subscription'} onClose={close} athlete={selected} onSaved={load} mode={subMode} />
      <CreditDialog isOpen={dialog === 'credit'} onClose={close} athlete={selected} onSaved={load} />
      <FreeSessionDialog isOpen={dialog === 'freeSession'} onClose={close}
                         athletes={athleteOptions} canDelete={can('athletes', 'free_session')} />
      <AthleteDetailsDialog isOpen={dialog === 'details'} onClose={close} athlete={selected} onChanged={load} />
      <PayDebtDialog isOpen={dialog === 'pay'} onClose={close} athlete={selected} onSaved={load} />
      <AttendanceDialog isOpen={dialog === 'presence' || dialog === 'absence'} onClose={close} athlete={selected}
                        initialStatus={dialog === 'absence' ? 'absent' : 'present'} onSaved={load} />
      <ExtraFeeDialog isOpen={dialog === 'fee'} onClose={close} athlete={selected} athletes={athletes} onSaved={load} />

      <AlertDialog open={toDelete !== null} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent className="bg-gym-gray border-gym-gold/20 text-gym-gold-light">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gym-gold">{tr('Supprimer cet athlète ?', 'حذف هذا الرياضي؟')}</AlertDialogTitle>
            <AlertDialogDescription className="text-gym-gold/60">
              {toDelete?.full_name} — {tr('Ses abonnements, frais et historique seront supprimés.', 'سيتم حذف اشتراكاته ورسومه وسجله.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10">{tr('Annuler', 'إلغاء')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 text-white hover:bg-red-700">{tr('Supprimer', 'حذف')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
