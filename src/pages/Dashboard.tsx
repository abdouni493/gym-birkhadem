import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth, usePermissions } from '@/contexts/AuthContext';
import { useLang } from '@/hooks/useLang';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import {
  Users, Calendar, Package, AlertTriangle, Truck, Wallet, TrendingUp, TrendingDown, Zap,
  Barcode, ShoppingCart, UserCog, BellRing, CalendarClock, ChevronRight, User, HandCoins,
  UserCheck, Receipt, BarChart3, Scale, Activity, X,
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import { supabase, describeError } from '@/lib/supabase';
import { StreamEntry, getCaisseBalance, listRevenue, listExpenseStream } from '@/lib/api/caisse';
import { productStatus } from '@/lib/api/products';
import { debtByAthlete } from '@/lib/api/athleteExtras';
import { formatDZD, cn } from '@/lib/utils';
import { daysLeft } from '@/components/athletes/athleteStatus';

interface AthleteLite { id: string; full_name: string; photo_url: string | null; subscription_expiry: string | null; phone: string | null }
interface StockAlert { id: string; name: string; stock: number; status: string }

interface Data {
  athletes: AthleteLite[];
  debts: Record<string, number>;
  products: number;
  stockValue: number;
  stockAlerts: StockAlert[];
  workers: number;
  suppliers: number;
  freeToday: number;
  presentToday: number;
  caisse: { total_in: number; total_out: number; balance: number };
  revenue: StreamEntry[];   // last 30 days
  expenses: StreamEntry[];  // last 30 days
}

const iso = (d: Date) => d.toLocaleDateString('en-CA');

const count = async (table: string, eq?: [string, string]): Promise<number> => {
  const base = supabase.from(table).select('*', { count: 'exact', head: true });
  const { count: c, error } = await (eq ? base.eq(eq[0], eq[1]) : base);
  if (error) return 0;
  return c ?? 0;
};

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const { canView, can, isAdmin } = usePermissions();
  const { tr, locale, fmtDate } = useLang();
  const navigate = useNavigate();

  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const today = iso(new Date());
  const monthAgo = iso(new Date(Date.now() - 29 * 86400000));

  const load = useCallback(async () => {
    setError(null);
    try {
      const [athRes, prodRes, debts, workers, suppliers, freeToday, presentToday, caisse, revenue, expenses] = await Promise.all([
        supabase.from('athletes').select('id, full_name, photo_url, subscription_expiry, phone'),
        supabase.from('products').select('id, name, current_stock, min_stock_level, real_price'),
        debtByAthlete().catch(() => ({} as Record<string, number>)),
        count('workers'),
        count('suppliers'),
        count('free_sessions', ['session_date', today]),
        count('athlete_attendance', ['att_date', today]),
        getCaisseBalance().catch(() => ({ total_in: 0, total_out: 0, balance: 0 })),
        listRevenue({ from: monthAgo, to: today }).catch(() => [] as StreamEntry[]),
        listExpenseStream({ from: monthAgo, to: today }).catch(() => [] as StreamEntry[]),
      ]);
      if (athRes.error && canView('athletes')) throw athRes.error;
      const products = (prodRes.data ?? []) as { id: string; name: string; current_stock: number; min_stock_level: number; real_price: number }[];
      setData({
        athletes: (athRes.data ?? []) as AthleteLite[],
        debts,
        products: products.length,
        stockValue: products.reduce((s, p) => s + Number(p.current_stock) * Number(p.real_price), 0),
        stockAlerts: products
          .map((p) => ({ id: p.id, name: p.name, stock: p.current_stock, status: productStatus(p.current_stock, p.min_stock_level) }))
          .filter((p) => p.status !== 'in_stock').sort((a, b) => a.stock - b.stock),
        workers, suppliers, freeToday, presentToday, caisse, revenue, expenses,
      });
    } catch (e) {
      setError(describeError(e));
    }
  }, [today, monthAgo, canView]);

  useEffect(() => { load(); }, [load]);

  const d = useMemo(() => {
    if (!data) return null;
    const withDays = data.athletes.map((a) => ({ ...a, left: daysLeft(a.subscription_expiry) }));
    const expired = withDays.filter((a) => a.left !== null && a.left < 0).sort((a, b) => (b.left ?? 0) - (a.left ?? 0));
    const expiring = withDays.filter((a) => a.left !== null && a.left >= 0 && a.left <= 7).sort((a, b) => (a.left ?? 0) - (b.left ?? 0));
    const active = withDays.filter((a) => a.left === null ? false : a.left >= 0).length;
    const debtors = data.athletes.filter((a) => (data.debts[a.id] ?? 0) > 0)
      .map((a) => ({ ...a, debt: data.debts[a.id] })).sort((a, b) => b.debt - a.debt);
    const totalDebt = debtors.reduce((s, a) => s + a.debt, 0);
    const sum = (rows: StreamEntry[], from: string) => rows.filter((r) => r.entry_date >= from).reduce((s, r) => s + Number(r.amount), 0);
    const weekAgo = iso(new Date(Date.now() - 6 * 86400000));
    const chart: { label: string; in: number; out: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const day = iso(new Date(Date.now() - i * 86400000));
      chart.push({
        label: new Date(`${day}T00:00:00`).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' }),
        in: data.revenue.filter((r) => r.entry_date === day).reduce((s, r) => s + Number(r.amount), 0),
        out: data.expenses.filter((r) => r.entry_date === day).reduce((s, r) => s + Number(r.amount), 0),
      });
    }
    const recent = [...data.revenue.map((r) => ({ ...r, flow: 'in' as const })), ...data.expenses.map((r) => ({ ...r, flow: 'out' as const }))]
      .sort((a, b) => b.entry_date.localeCompare(a.entry_date)).slice(0, 8);
    return {
      expired, expiring, active, debtors, totalDebt, chart, recent,
      inToday: sum(data.revenue, today), outToday: sum(data.expenses, today),
      inWeek: sum(data.revenue, weekAgo), outWeek: sum(data.expenses, weekAgo),
      inMonth: sum(data.revenue, monthAgo), outMonth: sum(data.expenses, monthAgo),
    };
  }, [data, today, monthAgo, locale]);

  const showMoney = can('dashboard', 'view_revenue');

  const quickActions = [
    { key: 'athletes', label: tr('Athlètes', 'الرياضيون'), icon: Users, path: '/athletes', color: 'from-blue-500 to-indigo-600' },
    { key: 'pos', label: tr('Point de vente', 'نقطة البيع'), icon: ShoppingCart, path: '/pos', color: 'from-emerald-500 to-green-600' },
    { key: 'subscriptions', label: tr('Abonnements', 'الاشتراكات'), icon: Calendar, path: '/subscriptions', color: 'from-purple-500 to-fuchsia-600' },
    { key: 'products', label: tr('Stock', 'المخزون'), icon: Package, path: '/products', color: 'from-orange-500 to-amber-600' },
    { key: 'caisse', label: tr('Caisse', 'الصندوق'), icon: Wallet, path: '/caisse', color: 'from-teal-500 to-cyan-600' },
    { key: 'scanner', label: tr('Scanner', 'الماسح'), icon: Barcode, path: '/scanner', color: 'from-yellow-500 to-amber-500' },
    { key: 'expenses', label: tr('Dépenses', 'المصاريف'), icon: Receipt, path: '/expenses', color: 'from-rose-500 to-red-600' },
    { key: 'reports', label: tr('Rapports', 'التقارير'), icon: BarChart3, path: '/reports', color: 'from-sky-500 to-blue-600' },
    { key: 'workers', label: tr('Employés', 'العمال'), icon: UserCog, path: '/workers', color: 'from-slate-500 to-slate-700' },
  ].filter((a) => canView(a.key));

  const Stat: React.FC<{ icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string; tone: string; onClick?: () => void }> =
    ({ icon, label, value, sub, tone, onClick }) => (
      <button type="button" onClick={onClick} disabled={!onClick}
              className={cn('text-start rounded-2xl border p-4 bg-gradient-to-br to-gym-gray transition-all',
                onClick && 'hover:-translate-y-0.5 hover:shadow-lg cursor-pointer', tone)}>
        <div className="flex items-center justify-between">
          <p className="text-xs text-gym-gold/70">{label}</p>
          <div className="w-9 h-9 rounded-xl bg-black/30 flex items-center justify-center">{icon}</div>
        </div>
        <p className="text-2xl font-bold mt-2 text-white">{value}</p>
        {sub && <p className="text-[11px] text-gym-gold/50 mt-0.5">{sub}</p>}
      </button>
    );

  const AlertCard: React.FC<{ id: string; title: string; icon: React.ReactNode; tone: string; children: React.ReactNode; onAll: () => void }> =
    ({ id, title, icon, tone, children, onAll }) => hidden.includes(id) ? null : (
      <Card className={cn('bg-gym-gray overflow-hidden', tone)}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <h3 className="font-semibold text-gym-gold flex items-center gap-2 text-sm">{icon}{title}</h3>
          <button onClick={() => setHidden((h) => [...h, id])} className="p-1 rounded text-gym-gold/40 hover:text-gym-gold hover:bg-gym-gold/10" aria-label={tr('Masquer', 'إخفاء')}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <CardContent className="p-3 space-y-1.5">
          {children}
          <Button variant="ghost" size="sm" onClick={onAll} className="w-full text-gym-gold/60 hover:text-gym-gold hover:bg-gym-gold/10">
            {tr('Voir tout', 'عرض الكل')}<ChevronRight className="w-4 h-4 ms-1 rtl:rotate-180" />
          </Button>
        </CardContent>
      </Card>
    );

  const PersonRow: React.FC<{ a: AthleteLite; right: React.ReactNode; onClick: () => void }> = ({ a, right, onClick }) => (
    <button onClick={onClick} className="w-full flex items-center justify-between gap-3 p-2 rounded-lg hover:bg-gym-gold/5 text-start">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-8 h-8 rounded-full bg-gym-gold/15 flex items-center justify-center overflow-hidden shrink-0">
          {a.photo_url ? <img src={a.photo_url} alt="" className="w-full h-full object-cover" /> : <User className="w-4 h-4 text-gym-gold/60" />}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-gym-gold truncate">{a.full_name}</p>
          <p className="text-[11px] text-gym-gold/40">{a.phone ?? '—'}</p>
        </div>
      </div>
      <div className="shrink-0">{right}</div>
    </button>
  );

  const hour = new Date().getHours();
  const greet = hour < 12 ? tr('Bonjour', 'صباح الخير') : hour < 18 ? tr('Bon après-midi', 'طاب يومك') : tr('Bonsoir', 'مساء الخير');

  return (
    <div className="min-h-screen bg-gym-black text-gym-gold-light p-0 md:p-2">
      <div className="max-w-7xl mx-auto space-y-4 md:space-y-6">
        {/* Hero */}
        <div className="rounded-2xl md:rounded-3xl border border-gym-gold/20 bg-gradient-to-br from-gym-gold/20 via-gym-gray to-gym-black p-4 md:p-6 flex flex-wrap items-center justify-between gap-4 animate-fade-in">
          <div>
            <h1 className="text-3xl md:text-2xl md:text-4xl font-bold gradient-text">{greet}, {user?.firstName} 💪</h1>
            <p className="text-gym-gold/60 mt-1">{tr('Voici l’état de votre salle aujourd’hui.', 'إليك حالة قاعتك اليوم.')}</p>
          </div>
          <div className="text-end">
            <p className="text-lg font-bold text-gym-gold capitalize">
              {new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
            {d && canView('athletes') && (
              <p className="text-sm text-gym-gold/60 flex items-center gap-1 justify-end"><Activity className="w-4 h-4" />{data?.presentToday} {tr('présence(s) aujourd’hui', 'حضور اليوم')}</p>
            )}
          </div>
        </div>

        {error ? (
          <Card className="bg-gym-gray border-red-500/30">
            <CardContent className="p-8 text-center space-y-3">
              <p className="text-red-400 font-medium">{tr('Impossible de charger le tableau de bord', 'تعذر تحميل لوحة التحكم')}</p>
              <p className="text-sm text-gym-gold/50">{error}</p>
              <Button variant="outline" onClick={load} className="border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10">{tr('Réessayer', 'إعادة المحاولة')}</Button>
            </CardContent>
          </Card>
        ) : !data || !d ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => <Card key={i} className="bg-gym-gray border-gym-gold/20 animate-pulse"><CardContent className="h-28" /></Card>)}
          </div>
        ) : (
          <>
            {/* Money */}
            {showMoney && (canView('caisse') || canView('reports')) && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Stat icon={<TrendingUp className="w-5 h-5 text-green-400" />} label={tr('Recettes aujourd’hui', 'إيرادات اليوم')} value={formatDZD(d.inToday)}
                      sub={`${tr('7 jours', '7 أيام')} : ${formatDZD(d.inWeek)}`} tone="from-green-500/20 border-green-500/30" />
                <Stat icon={<TrendingDown className="w-5 h-5 text-red-400" />} label={tr('Dépenses aujourd’hui', 'مصاريف اليوم')} value={formatDZD(d.outToday)}
                      sub={`${tr('7 jours', '7 أيام')} : ${formatDZD(d.outWeek)}`} tone="from-red-500/20 border-red-500/30" />
                <Stat icon={<Scale className="w-5 h-5 text-gym-gold" />} label={tr('Résultat 30 jours', 'نتيجة 30 يومًا')} value={formatDZD(d.inMonth - d.outMonth)}
                      sub={`${formatDZD(d.inMonth)} − ${formatDZD(d.outMonth)}`} tone="from-gym-gold/20 border-gym-gold/30" onClick={canView('reports') ? () => navigate('/reports') : undefined} />
                <Stat icon={<Wallet className="w-5 h-5 text-teal-300" />} label={tr('Solde de la caisse', 'رصيد الصندوق')} value={formatDZD(data.caisse.balance)}
                      sub={`${tr('Entrées', 'مداخيل')} ${formatDZD(data.caisse.total_in)}`} tone="from-teal-500/20 border-teal-500/30" onClick={canView('caisse') ? () => navigate('/caisse') : undefined} />
              </div>
            )}

            {/* Activity */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {canView('athletes') && <>
                <Stat icon={<Users className="w-5 h-5 text-blue-300" />} label={tr('Athlètes', 'الرياضيون')} value={data.athletes.length}
                      sub={`${d.active} ${tr('actifs', 'نشطون')}`} tone="from-blue-500/20 border-blue-500/30" onClick={() => navigate('/athletes')} />
                <Stat icon={<CalendarClock className="w-5 h-5 text-red-400" />} label={tr('Abonnements expirés', 'اشتراكات منتهية')} value={d.expired.length}
                      sub={`${d.expiring.length} ${tr('expirent sous 7 jours', 'تنتهي خلال 7 أيام')}`} tone="from-red-500/20 border-red-500/30" onClick={() => navigate('/athletes')} />
                <Stat icon={<HandCoins className="w-5 h-5 text-orange-300" />} label={tr('Dettes athlètes', 'ديون الرياضيين')} value={formatDZD(d.totalDebt)}
                      sub={`${d.debtors.length} ${tr('athlète(s)', 'رياضي')}`} tone="from-orange-500/20 border-orange-500/30" onClick={() => navigate('/athletes')} />
                <Stat icon={<UserCheck className="w-5 h-5 text-emerald-300" />} label={tr('Présences aujourd’hui', 'حضور اليوم')} value={data.presentToday}
                      sub={`${data.freeToday} ${tr('séance(s) libre(s)', 'حصة حرة')}`} tone="from-emerald-500/20 border-emerald-500/30" />
              </>}
              {canView('products') && <>
                <Stat icon={<Package className="w-5 h-5 text-purple-300" />} label={tr('Produits', 'المنتجات')} value={data.products}
                      sub={showMoney ? `${tr('Valeur', 'القيمة')} ${formatDZD(data.stockValue)}` : undefined} tone="from-purple-500/20 border-purple-500/30" onClick={() => navigate('/products')} />
                <Stat icon={<AlertTriangle className="w-5 h-5 text-amber-300" />} label={tr('Stock faible', 'مخزون منخفض')} value={data.stockAlerts.length}
                      sub={tr('À réapprovisionner', 'بحاجة لإعادة التموين')} tone="from-amber-500/20 border-amber-500/30" onClick={() => navigate('/products')} />
              </>}
              {canView('workers') && <Stat icon={<UserCog className="w-5 h-5 text-slate-300" />} label={tr('Employés', 'العمال')} value={data.workers} tone="from-slate-500/20 border-slate-500/30" onClick={() => navigate('/workers')} />}
              {canView('suppliers') && <Stat icon={<Truck className="w-5 h-5 text-pink-300" />} label={tr('Fournisseurs', 'الموردون')} value={data.suppliers} tone="from-pink-500/20 border-pink-500/30" onClick={() => navigate('/suppliers')} />}
            </div>

            {/* Alerts */}
            {(d.expired.length > 0 || d.expiring.length > 0 || d.debtors.length > 0 || data.stockAlerts.length > 0) && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <BellRing className="w-5 h-5 text-gym-gold" />
                  <h2 className="text-xl font-bold text-gym-gold">{tr('Alertes', 'التنبيهات')}</h2>
                  <span className="text-sm text-gym-gold/50">— {tr('ce qui demande votre attention', 'ما يتطلب انتباهك')}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                  {canView('athletes') && d.debtors.length > 0 && (
                    <AlertCard id="debt" title={`${tr('Dettes', 'الديون')} (${d.debtors.length})`} icon={<HandCoins className="w-4 h-4 text-orange-300" />}
                               tone="border-orange-500/30" onAll={() => navigate('/athletes')}>
                      {d.debtors.slice(0, 5).map((a) => (
                        <PersonRow key={a.id} a={a} onClick={() => navigate('/athletes')}
                                   right={<span className="text-sm font-bold text-orange-300">{formatDZD(a.debt)}</span>} />
                      ))}
                    </AlertCard>
                  )}
                  {canView('athletes') && d.expired.length > 0 && (
                    <AlertCard id="expired" title={`${tr('Expirés', 'منتهية')} (${d.expired.length})`} icon={<CalendarClock className="w-4 h-4 text-red-400" />}
                               tone="border-red-500/30" onAll={() => navigate('/athletes')}>
                      {d.expired.slice(0, 5).map((a) => (
                        <PersonRow key={a.id} a={a} onClick={() => navigate('/athletes')}
                                   right={<Badge variant="outline" className="border-red-500/40 text-red-300 text-[10px]">{fmtDate(a.subscription_expiry)}</Badge>} />
                      ))}
                    </AlertCard>
                  )}
                  {canView('athletes') && d.expiring.length > 0 && (
                    <AlertCard id="expiring" title={`${tr('Expirent bientôt', 'تنتهي قريبًا')} (${d.expiring.length})`} icon={<CalendarClock className="w-4 h-4 text-amber-300" />}
                               tone="border-amber-500/30" onAll={() => navigate('/athletes')}>
                      {d.expiring.slice(0, 5).map((a) => (
                        <PersonRow key={a.id} a={a} onClick={() => navigate('/athletes')}
                                   right={<Badge variant="outline" className="border-amber-500/40 text-amber-300 text-[10px]">
                                     {a.left === 0 ? tr('Aujourd’hui', 'اليوم') : `${a.left} ${tr('j', 'ي')}`}</Badge>} />
                      ))}
                    </AlertCard>
                  )}
                  {canView('products') && data.stockAlerts.length > 0 && (
                    <AlertCard id="stock" title={`${tr('Stock', 'المخزون')} (${data.stockAlerts.length})`} icon={<Package className="w-4 h-4 text-purple-300" />}
                               tone="border-purple-500/30" onAll={() => navigate('/products')}>
                      {data.stockAlerts.slice(0, 5).map((p) => (
                        <button key={p.id} onClick={() => navigate('/products')} className="w-full flex items-center justify-between gap-2 p-2 rounded-lg hover:bg-gym-gold/5 text-start">
                          <span className="text-sm text-gym-gold truncate">{p.name}</span>
                          <Badge variant="outline" className={cn('text-[10px] shrink-0', p.status === 'out_of_stock' ? 'border-red-500/40 text-red-300' : 'border-orange-500/40 text-orange-300')}>
                            {p.status === 'out_of_stock' ? tr('Rupture', 'نفد') : `${p.stock} ${tr('restant(s)', 'متبقٍ')}`}
                          </Badge>
                        </button>
                      ))}
                    </AlertCard>
                  )}
                </div>
              </div>
            )}

            {/* Chart + recent */}
            {showMoney && (canView('caisse') || canView('reports')) && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="bg-gym-gray border-gym-gold/15 lg:col-span-2">
                  <CardContent className="p-5">
                    <h3 className="font-semibold text-gym-gold mb-4 flex items-center gap-2"><TrendingUp className="w-4 h-4" />{tr('Recettes et dépenses — 14 derniers jours', 'الإيرادات والمصاريف — آخر 14 يومًا')}</h3>
                    <div className="h-64" dir="ltr">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={d.chart}>
                          <defs>
                            <linearGradient id="dIn" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4ade80" stopOpacity={0.45} /><stop offset="100%" stopColor="#4ade80" stopOpacity={0} /></linearGradient>
                            <linearGradient id="dOut" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f87171" stopOpacity={0.45} /><stop offset="100%" stopColor="#f87171" stopOpacity={0} /></linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(243,201,105,0.08)" />
                          <XAxis dataKey="label" tick={{ fill: 'rgba(243,201,105,0.6)', fontSize: 11 }} />
                          <YAxis tick={{ fill: 'rgba(243,201,105,0.6)', fontSize: 11 }} />
                          <Tooltip contentStyle={{ background: '#151515', border: '1px solid rgba(243,201,105,0.3)', borderRadius: 10 }} formatter={(v: number) => formatDZD(v)} />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                          <Area type="monotone" dataKey="in" name={tr('Recettes', 'الإيرادات')} stroke="#4ade80" fill="url(#dIn)" strokeWidth={2} />
                          <Area type="monotone" dataKey="out" name={tr('Dépenses', 'المصاريف')} stroke="#f87171" fill="url(#dOut)" strokeWidth={2} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-gym-gray border-gym-gold/15">
                  <CardContent className="p-5">
                    <h3 className="font-semibold text-gym-gold mb-3 flex items-center gap-2"><Activity className="w-4 h-4" />{tr('Dernières opérations', 'آخر العمليات')}</h3>
                    {d.recent.length === 0 ? <p className="text-sm text-gym-gold/40 py-6 text-center">{tr('Aucune opération.', 'لا توجد عمليات.')}</p> : (
                      <div className="space-y-1.5">
                        {d.recent.map((r) => (
                          <div key={`${r.source}-${r.ref_id}`} className="flex items-center justify-between gap-2 p-2 rounded-lg border border-gym-gold/10">
                            <div className="min-w-0">
                              <p className="text-sm truncate">{r.label}</p>
                              <p className="text-[11px] text-gym-gold/40 truncate">{fmtDate(r.entry_date)} · {r.detail}</p>
                            </div>
                            <span className={cn('text-sm font-semibold shrink-0', r.flow === 'in' ? 'text-green-400' : 'text-red-400')}>
                              {r.flow === 'in' ? '+' : '−'}{formatDZD(r.amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Quick actions */}
            {quickActions.length > 0 && (
              <div>
                <h2 className="text-lg font-bold text-gym-gold mb-3 flex items-center gap-2"><Zap className="w-5 h-5" />{tr('Accès rapide', 'وصول سريع')}</h2>
                <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-3">
                  {quickActions.map((a) => (
                    <button key={a.key} onClick={() => navigate(a.path)}
                            className={cn('rounded-2xl p-4 bg-gradient-to-br text-white flex flex-col items-center gap-2 hover:scale-105 hover:shadow-xl transition-all', a.color)}>
                      <a.icon className="w-6 h-6" />
                      <span className="text-xs font-semibold text-center">{a.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!isAdmin && quickActions.length === 0 && (
              <Card className="bg-gym-gray border-gym-gold/20">
                <CardContent className="p-12 text-center text-gym-gold/60">
                  {tr('Votre compte n’a encore accès à aucune interface. Demandez à un administrateur de définir vos permissions.', 'حسابك لا يملك صلاحية الوصول إلى أي واجهة بعد. اطلب من المسؤول تحديد صلاحياتك.')}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
};
