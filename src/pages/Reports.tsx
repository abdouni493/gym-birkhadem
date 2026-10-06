import React, { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  TrendingUp, TrendingDown, Scale, Printer, Search, BarChart3, CalendarRange, Loader2,
  Users, UserCheck, HandCoins, ShoppingCart, Truck, Receipt, Package, Wallet, UserCog,
  LayoutGrid, ArrowLeft, Sparkles,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  AreaChart, Area, PieChart, Pie, Cell,
} from 'recharts';
import { formatDZD, cn } from '@/lib/utils';
import { describeError } from '@/lib/supabase';
import { usePermissions } from '@/contexts/AuthContext';
import { useLang } from '@/hooks/useLang';
import { productStatus } from '@/lib/api/products';
import { ReportData, loadReport } from '@/lib/api/reports';

const iso = (d: Date) => d.toLocaleDateString('en-CA');
const today = () => iso(new Date());
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
const monthStart = () => { const d = new Date(); return iso(new Date(d.getFullYear(), d.getMonth(), 1)); };
const yearStart = () => iso(new Date(new Date().getFullYear(), 0, 1));

type SectionKey = 'overview' | 'athletes' | 'sales' | 'purchases' | 'expenses' | 'workers' | 'caisse' | 'stock';

const PIE = ['#f3c969', '#4ade80', '#60a5fa', '#c084fc', '#f472b6', '#fb923c', '#2dd4bf', '#f87171', '#a3e635', '#e879f9'];

export const Reports: React.FC = () => {
  const { can, canView } = usePermissions();
  const { tr, fmtDate } = useLang();

  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<SectionKey>('overview');
  const [search, setSearch] = useState('');
  const [athleteTab, setAthleteTab] = useState<'subs' | 'fees' | 'payments' | 'attendance' | 'new' | 'debts' | 'free'>('subs');
  const [expenseCat, setExpenseCat] = useState('all');

  const SOURCE: Record<string, string> = {
    subscription: tr('Abonnements', 'الاشتراكات'),
    free_session: tr('Séances libres', 'الحصص الحرة'),
    extra_fee: tr('Frais supplémentaires', 'الرسوم الإضافية'),
    debt_payment: tr('Paiements de dettes', 'تسديد الديون'),
    sale: tr('Ventes', 'المبيعات'),
    cash_deposit: tr('Dépôts caisse', 'إيداعات الصندوق'),
    expense: tr('Dépenses', 'المصاريف'),
    worker_payment: tr('Salaires', 'الرواتب'),
    worker_acompte: tr('Acomptes', 'التسبيقات'),
    purchase: tr('Achats', 'المشتريات'),
    cash_withdraw: tr('Retraits caisse', 'سحوبات الصندوق'),
  };

  const generate = async () => {
    if (!from || !to || from > to) {
      setError(tr('La date de début doit précéder la date de fin.', 'يجب أن يسبق تاريخ البداية تاريخ النهاية.'));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setData(await loadReport({ from, to }));
      setSection('overview');
      setSearch('');
    } catch (e) {
      setError(describeError(e));
    } finally {
      setLoading(false);
    }
  };

  // ---- Derived figures ------------------------------------------------------
  const totals = useMemo(() => {
    if (!data) return { in: 0, out: 0, net: 0 };
    const inSum = data.revenue.reduce((s, r) => s + Number(r.amount), 0);
    const outSum = data.expenses.reduce((s, r) => s + Number(r.amount), 0);
    return { in: inSum, out: outSum, net: inSum - outSum };
  }, [data]);

  const daily = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, { date: string; in: number; out: number }>();
    for (const r of data.revenue) {
      const c = map.get(r.entry_date) ?? { date: r.entry_date, in: 0, out: 0 };
      c.in += Number(r.amount); map.set(r.entry_date, c);
    }
    for (const r of data.expenses) {
      const c = map.get(r.entry_date) ?? { date: r.entry_date, in: 0, out: 0 };
      c.out += Number(r.amount); map.set(r.entry_date, c);
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({ ...d, label: fmtDate(d.date) }));
  }, [data, fmtDate]);

  const bySource = (rows: { source: string; amount: number }[]) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.source, (m.get(r.source) ?? 0) + Number(r.amount));
    return Array.from(m.entries()).map(([k, v]) => ({ name: SOURCE[k] ?? k, value: v })).sort((a, b) => b.value - a.value);
  };
  const revenueBySource = useMemo(() => (data ? bySource(data.revenue) : []), [data, tr]); // eslint-disable-line react-hooks/exhaustive-deps
  const expenseBySource = useMemo(() => (data ? bySource(data.expenses) : []), [data, tr]); // eslint-disable-line react-hooks/exhaustive-deps

  const q = search.trim().toLowerCase();
  const match = (...vals: (string | null | undefined)[]) => !q || vals.some((v) => (v ?? '').toLowerCase().includes(q));

  // ---- UI helpers -----------------------------------------------------------
  const Kpi: React.FC<{ icon: React.ReactNode; label: string; value: string | number; tone: string; sub?: string }> =
    ({ icon, label, value, tone, sub }) => (
      <div className={cn('rounded-2xl border p-4 bg-gradient-to-br to-gym-gray', tone)}>
        <div className="flex items-center justify-between">
          <p className="text-xs text-gym-gold/70">{label}</p>
          <div className="w-9 h-9 rounded-xl bg-black/30 flex items-center justify-center">{icon}</div>
        </div>
        <p className="text-2xl font-bold mt-2 text-white">{value}</p>
        {sub && <p className="text-[11px] text-gym-gold/50 mt-0.5">{sub}</p>}
      </div>
    );

  const Panel: React.FC<{ title: string; icon?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode }> =
    ({ title, icon, right, children }) => (
      <Card className="bg-gym-gray border-gym-gold/15 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-b border-gym-gold/10 bg-gym-black/30">
          <h3 className="font-semibold text-gym-gold flex items-center gap-2">{icon}{title}</h3>
          {right}
        </div>
        <CardContent className="p-5">{children}</CardContent>
      </Card>
    );

  const Table: React.FC<{ head: string[]; rows: React.ReactNode[][]; empty?: string; alignEnd?: number[] }> =
    ({ head, rows, empty, alignEnd = [] }) => rows.length === 0 ? (
      <p className="text-sm text-gym-gold/40 text-center py-8">{empty ?? tr('Aucune donnée pour cette période.', 'لا توجد بيانات لهذه الفترة.')}</p>
    ) : (
      <div className="overflow-x-auto max-h-[480px] overflow-y-auto rounded-lg border border-gym-gold/10">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gym-black text-gym-gold/70 text-xs">
            <tr>{head.map((h, i) => <th key={h} className={cn('px-3 py-2.5 font-medium', alignEnd.includes(i) ? 'text-end' : 'text-start')}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-gym-gold/10 hover:bg-gym-gold/5">
                {r.map((c, j) => <td key={j} className={cn('px-3 py-2', alignEnd.includes(j) ? 'text-end' : 'text-start')}>{c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

  const Chip: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
    <button type="button" onClick={onClick}
            className={cn('px-3 py-1.5 rounded-full text-xs border transition-colors',
              active ? 'bg-gym-gold text-gym-black border-gym-gold font-semibold' : 'border-gym-gold/25 text-gym-gold/70 hover:bg-gym-gold/10')}>
      {children}
    </button>
  );

  const money = (v: number, tone?: 'in' | 'out' | 'debt') => (
    <span className={cn('font-semibold', tone === 'in' ? 'text-green-400' : tone === 'out' ? 'text-red-400' : tone === 'debt' ? 'text-orange-300' : 'text-gym-gold')}>
      {formatDZD(v)}
    </span>
  );

  // ---- Step 1: period picker -------------------------------------------------
  if (!data) {
    return (
      <div className="min-h-screen bg-gym-black text-gym-gold p-6">
        <div className="max-w-2xl mx-auto pt-8 space-y-6 animate-fade-in">
          <div className="text-center space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-gym-gold to-amber-600 mx-auto flex items-center justify-center shadow-lg shadow-gym-gold/20">
              <BarChart3 className="w-8 h-8 text-gym-black" />
            </div>
            <h1 className="text-3xl font-bold gradient-text">{tr('Rapports', 'التقارير')}</h1>
            <p className="text-gym-gold/60">{tr('Choisissez la période à analyser puis générez le rapport.', 'اختر الفترة المراد تحليلها ثم أنشئ التقرير.')}</p>
          </div>

          <Card className="bg-gym-gray border-gym-gold/25 shadow-2xl">
            <CardContent className="p-6 space-y-5">
              <div className="flex flex-wrap gap-2 justify-center">
                {[
                  [tr('Aujourd’hui', 'اليوم'), today(), today()],
                  [tr('7 derniers jours', 'آخر 7 أيام'), daysAgo(6), today()],
                  [tr('Ce mois', 'هذا الشهر'), monthStart(), today()],
                  [tr('30 derniers jours', 'آخر 30 يومًا'), daysAgo(29), today()],
                  [tr('Cette année', 'هذه السنة'), yearStart(), today()],
                ].map(([label, f, t2]) => (
                  <Chip key={label} active={from === f && to === t2} onClick={() => { setFrom(f); setTo(t2); }}>{label}</Chip>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-gym-gold/80"><CalendarRange className="w-4 h-4" />{tr('Date de début', 'تاريخ البداية')}</Label>
                  <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="gym-input h-12 text-base" />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-gym-gold/80"><CalendarRange className="w-4 h-4" />{tr('Date de fin', 'تاريخ النهاية')}</Label>
                  <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="gym-input h-12 text-base" />
                </div>
              </div>
              {error && <p className="text-sm text-red-400 text-center">{error}</p>}
              <Button onClick={generate} disabled={loading}
                      className="w-full h-12 text-base font-bold bg-gradient-to-r from-gym-gold to-amber-500 text-gym-black hover:opacity-90">
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Sparkles className="w-5 h-5 me-2" />{tr('Générer le rapport', 'إنشاء التقرير')}</>}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ---- Step 2: the report -----------------------------------------------------
  const sections: { key: SectionKey; label: string; icon: React.ComponentType<{ className?: string }>; show: boolean }[] = [
    { key: 'overview', label: tr('Vue d’ensemble', 'نظرة عامة'), icon: LayoutGrid, show: true },
    { key: 'athletes', label: tr('Athlètes', 'الرياضيون'), icon: Users, show: canView('athletes') },
    { key: 'sales', label: tr('Ventes', 'المبيعات'), icon: ShoppingCart, show: canView('invoices') || canView('pos') },
    { key: 'purchases', label: tr('Achats', 'المشتريات'), icon: Truck, show: canView('purchase_invoices') },
    { key: 'expenses', label: tr('Dépenses', 'المصاريف'), icon: Receipt, show: canView('expenses') },
    { key: 'workers', label: tr('Employés', 'العمال'), icon: UserCog, show: canView('workers') },
    { key: 'caisse', label: tr('Caisse', 'الصندوق'), icon: Wallet, show: canView('caisse') },
    { key: 'stock', label: tr('Stock', 'المخزون'), icon: Package, show: canView('products') },
  ];

  const presences = data.attendance.filter((a) => a.status === 'present').length;
  const absences = data.attendance.length - presences;
  const debtTotal = data.outstanding.reduce((s, o) => s + o.remaining, 0);
  const salesTotal = data.sales.reduce((s, x) => s + Number(x.total_amount), 0);
  const salesPaid = data.sales.reduce((s, x) => s + Number(x.amount_paid), 0);
  const purchTotal = data.purchases.reduce((s, x) => s + Number(x.total_amount), 0);
  const purchPaid = data.purchases.reduce((s, x) => s + Number(x.amount_paid), 0);
  const expCats = Array.from(new Set(data.expenseRows.map((e) => e.expense_categories?.name ?? tr('Sans catégorie', 'بدون فئة'))));
  const expRows = data.expenseRows.filter((e) =>
    (expenseCat === 'all' || (e.expense_categories?.name ?? tr('Sans catégorie', 'بدون فئة')) === expenseCat)
    && match(e.name, e.notes, e.expense_categories?.name));
  const workerRows = data.expenses.filter((e) => e.interface_key === 'workers' && match(e.label, e.detail));
  const caisseRows = [...data.revenue.filter((r) => r.source === 'cash_deposit').map((r) => ({ ...r, flow: 'in' as const })),
    ...data.expenses.filter((r) => r.source === 'cash_withdraw').map((r) => ({ ...r, flow: 'out' as const }))]
    .filter((r) => match(r.label, r.detail)).sort((a, b) => b.entry_date.localeCompare(a.entry_date));
  const stockValue = data.products.reduce((s, p) => s + Number(p.current_stock) * Number(p.real_price), 0);
  const lowStock = data.products.filter((p) => productStatus(p.current_stock, p.min_stock_level) !== 'in_stock');

  const searchBox = (
    <div className="relative w-full sm:w-64">
      <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gym-gold/50" />
      <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tr('Rechercher…', 'بحث…')}
             className="ps-9 h-9 bg-gym-black border-gym-gold/25 text-gym-gold" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gym-black text-gym-gold p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="rounded-2xl border border-gym-gold/20 bg-gradient-to-br from-gym-gold/15 via-gym-gray to-gym-black p-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold gradient-text flex items-center gap-2"><BarChart3 className="w-7 h-7 text-gym-gold" />{tr('Rapport', 'التقرير')}</h1>
            <p className="text-gym-gold/70 mt-1 flex items-center gap-2"><CalendarRange className="w-4 h-4" />{fmtDate(data.range.from)} → {fmtDate(data.range.to)}</p>
          </div>
          <div className="flex gap-2 print:hidden">
            <Button variant="outline" onClick={() => setData(null)} className="border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10">
              <ArrowLeft className="w-4 h-4 me-2 rtl:rotate-180" />{tr('Changer la période', 'تغيير الفترة')}
            </Button>
            {can('reports', 'export') && (
              <Button onClick={() => window.print()} className="bg-gym-gold text-gym-black hover:bg-gym-gold/90">
                <Printer className="w-4 h-4 me-2" />{tr('Imprimer', 'طباعة')}
              </Button>
            )}
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Kpi icon={<TrendingUp className="w-5 h-5 text-green-400" />} label={tr('Recettes', 'الإيرادات')} value={formatDZD(totals.in)} tone="from-green-500/20 border-green-500/30" sub={`${data.revenue.length} ${tr('opérations', 'عملية')}`} />
          <Kpi icon={<TrendingDown className="w-5 h-5 text-red-400" />} label={tr('Dépenses', 'المصاريف')} value={formatDZD(totals.out)} tone="from-red-500/20 border-red-500/30" sub={`${data.expenses.length} ${tr('opérations', 'عملية')}`} />
          <Kpi icon={<Scale className="w-5 h-5 text-gym-gold" />} label={tr('Résultat net', 'صافي النتيجة')} value={formatDZD(totals.net)} tone={totals.net >= 0 ? 'from-emerald-500/20 border-emerald-500/30' : 'from-red-600/25 border-red-600/40'} />
          <Kpi icon={<HandCoins className="w-5 h-5 text-orange-300" />} label={tr('Dettes en cours', 'الديون الحالية')} value={formatDZD(debtTotal)} tone="from-orange-500/20 border-orange-500/30" sub={`${data.outstanding.length} ${tr('athlète(s)', 'رياضي')}`} />
          <Kpi icon={<Users className="w-5 h-5 text-blue-300" />} label={tr('Nouveaux athlètes', 'رياضيون جدد')} value={data.newAthletes.length} tone="from-blue-500/20 border-blue-500/30" />
          <Kpi icon={<UserCheck className="w-5 h-5 text-teal-300" />} label={tr('Présences', 'الحضور')} value={presences} tone="from-teal-500/20 border-teal-500/30" sub={`${absences} ${tr('absence(s)', 'غياب')}`} />
          <Kpi icon={<ShoppingCart className="w-5 h-5 text-purple-300" />} label={tr('Ventes', 'المبيعات')} value={formatDZD(salesTotal)} tone="from-purple-500/20 border-purple-500/30" sub={`${data.sales.length} ${tr('facture(s)', 'فاتورة')}`} />
          <Kpi icon={<Truck className="w-5 h-5 text-pink-300" />} label={tr('Achats', 'المشتريات')} value={formatDZD(purchTotal)} tone="from-pink-500/20 border-pink-500/30" sub={`${data.purchases.length} ${tr('facture(s)', 'فاتورة')}`} />
        </div>

        {/* Section filter */}
        <div className="flex flex-wrap gap-2 print:hidden sticky top-0 z-10 bg-gym-black/90 backdrop-blur py-2">
          {sections.filter((s) => s.show).map((s) => (
            <button key={s.key} onClick={() => { setSection(s.key); setSearch(''); }}
                    className={cn('inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm border transition-all',
                      section === s.key ? 'bg-gym-gold text-gym-black border-gym-gold font-semibold shadow-lg shadow-gym-gold/10' : 'border-gym-gold/20 text-gym-gold/70 hover:bg-gym-gold/10')}>
              <s.icon className="w-4 h-4" />{s.label}
            </button>
          ))}
        </div>

        {/* ---- Overview ---- */}
        {section === 'overview' && (
          <div className="space-y-6">
            <Panel title={tr('Évolution quotidienne', 'التطور اليومي')} icon={<TrendingUp className="w-4 h-4" />}>
              {daily.length === 0 ? <p className="text-sm text-gym-gold/40 text-center py-8">{tr('Aucun mouvement.', 'لا توجد حركة.')}</p> : (
                <div className="h-72" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={daily}>
                      <defs>
                        <linearGradient id="gIn" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4ade80" stopOpacity={0.5} /><stop offset="100%" stopColor="#4ade80" stopOpacity={0} /></linearGradient>
                        <linearGradient id="gOut" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f87171" stopOpacity={0.5} /><stop offset="100%" stopColor="#f87171" stopOpacity={0} /></linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(243,201,105,0.08)" />
                      <XAxis dataKey="label" tick={{ fill: 'rgba(243,201,105,0.6)', fontSize: 11 }} />
                      <YAxis tick={{ fill: 'rgba(243,201,105,0.6)', fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: '#151515', border: '1px solid rgba(243,201,105,0.3)', borderRadius: 10 }}
                               labelStyle={{ color: '#f3c969' }} formatter={(v: number) => formatDZD(v)} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Area type="monotone" dataKey="in" name={tr('Recettes', 'الإيرادات')} stroke="#4ade80" fill="url(#gIn)" strokeWidth={2} />
                      <Area type="monotone" dataKey="out" name={tr('Dépenses', 'المصاريف')} stroke="#f87171" fill="url(#gOut)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Panel>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {[
                { title: tr('Recettes par source', 'الإيرادات حسب المصدر'), rows: revenueBySource, total: totals.in, tone: 'in' as const },
                { title: tr('Dépenses par source', 'المصاريف حسب المصدر'), rows: expenseBySource, total: totals.out, tone: 'out' as const },
              ].map((b) => (
                <Panel key={b.title} title={b.title} icon={b.tone === 'in' ? <TrendingUp className="w-4 h-4 text-green-400" /> : <TrendingDown className="w-4 h-4 text-red-400" />}>
                  {b.rows.length === 0 ? <p className="text-sm text-gym-gold/40 text-center py-8">{tr('Aucune donnée.', 'لا توجد بيانات.')}</p> : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                      <div className="h-48" dir="ltr">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={b.rows} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={2}>
                              {b.rows.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
                            </Pie>
                            <Tooltip contentStyle={{ background: '#151515', border: '1px solid rgba(243,201,105,0.3)', borderRadius: 10 }} formatter={(v: number) => formatDZD(v)} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="space-y-2">
                        {b.rows.map((r, i) => (
                          <div key={r.name} className="flex items-center justify-between gap-2 text-sm">
                            <span className="flex items-center gap-2 min-w-0"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PIE[i % PIE.length] }} /><span className="truncate">{r.name}</span></span>
                            <span className="text-end shrink-0">{money(r.value, b.tone)} <span className="text-[10px] text-gym-gold/40">{b.total ? Math.round((r.value / b.total) * 100) : 0}%</span></span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </Panel>
              ))}
            </div>

            <Panel title={tr('Toutes les opérations', 'كل العمليات')} icon={<BarChart3 className="w-4 h-4" />} right={searchBox}>
              <Table head={[tr('Date', 'التاريخ'), tr('Source', 'المصدر'), tr('Libellé', 'البيان'), tr('Détail', 'التفاصيل'), tr('Montant', 'المبلغ')]} alignEnd={[4]}
                     rows={[...data.revenue.map((r) => ({ ...r, flow: 'in' as const })), ...data.expenses.map((r) => ({ ...r, flow: 'out' as const }))]
                       .filter((r) => match(r.label, r.detail, SOURCE[r.source]))
                       .sort((a, b) => b.entry_date.localeCompare(a.entry_date))
                       .map((r) => [fmtDate(r.entry_date),
                         <Badge key="b" variant="outline" className={cn('text-[10px]', r.flow === 'in' ? 'border-green-500/30 text-green-300' : 'border-red-500/30 text-red-300')}>{SOURCE[r.source] ?? r.source}</Badge>,
                         r.label, <span key="d" className="text-gym-gold/50">{r.detail}</span>,
                         <span key="m" className={r.flow === 'in' ? 'text-green-400 font-semibold' : 'text-red-400 font-semibold'}>{r.flow === 'in' ? '+' : '−'}{formatDZD(r.amount)}</span>])} />
            </Panel>
          </div>
        )}

        {/* ---- Athletes ---- */}
        {section === 'athletes' && (
          <Panel title={tr('Athlètes', 'الرياضيون')} icon={<Users className="w-4 h-4" />} right={searchBox}>
            <div className="flex flex-wrap gap-2 mb-4">
              {([
                ['subs', `${tr('Abonnements', 'الاشتراكات')} (${data.subscriptions.length})`],
                ['fees', `${tr('Frais supp.', 'رسوم إضافية')} (${data.fees.length})`],
                ['payments', `${tr('Paiements de dettes', 'تسديد الديون')} (${data.payments.length})`],
                ['attendance', `${tr('Présences', 'الحضور')} (${data.attendance.length})`],
                ['new', `${tr('Nouveaux', 'جدد')} (${data.newAthletes.length})`],
                ['free', `${tr('Séances libres', 'حصص حرة')} (${data.freeSessions.length})`],
                ['debts', `${tr('Dettes en cours', 'الديون الحالية')} (${data.outstanding.length})`],
              ] as [typeof athleteTab, string][]).map(([k, l]) => <Chip key={k} active={athleteTab === k} onClick={() => setAthleteTab(k)}>{l}</Chip>)}
            </div>
            {athleteTab === 'subs' && (
              <Table head={[tr('Date', 'التاريخ'), tr('Athlète', 'الرياضي'), tr('Abonnement', 'الاشتراك'), tr('Expiration', 'الانتهاء'), tr('Prix', 'السعر'), tr('Payé', 'مدفوع'), tr('Reste', 'الباقي')]} alignEnd={[4, 5, 6]}
                     rows={data.subscriptions.filter((s) => match(s.name, s.athletes?.full_name)).map((s) => [fmtDate(s.payment_date), s.athletes?.full_name ?? '—', s.name, fmtDate(s.expiry_date), money(s.price), money(s.amount_paid, 'in'), s.remaining > 0 ? money(s.remaining, 'debt') : '—'])} />
            )}
            {athleteTab === 'fees' && (
              <Table head={[tr('Date', 'التاريخ'), tr('Athlète', 'الرياضي'), tr('Frais', 'الرسوم'), tr('Qté', 'الكمية'), tr('Total', 'المجموع'), tr('Payé', 'مدفوع'), tr('Reste', 'الباقي')]} alignEnd={[3, 4, 5, 6]}
                     rows={data.fees.filter((f) => match(f.name, f.athletes?.full_name)).map((f) => [fmtDate(f.fee_date), f.athletes?.full_name ?? '—', f.name, f.quantity, money(f.total), money(f.amount_paid, 'in'), f.remaining > 0 ? money(f.remaining, 'debt') : '—'])} />
            )}
            {athleteTab === 'payments' && (
              <Table head={[tr('Date', 'التاريخ'), tr('Athlète', 'الرياضي'), tr('Description', 'الوصف'), tr('Montant', 'المبلغ')]} alignEnd={[3]}
                     rows={data.payments.filter((p) => match(p.description, p.athletes?.full_name)).map((p) => [fmtDate(p.payment_date), p.athletes?.full_name ?? '—', p.description ?? '—', money(p.amount, 'in')])} />
            )}
            {athleteTab === 'attendance' && (
              <Table head={[tr('Date', 'التاريخ'), tr('Athlète', 'الرياضي'), tr('Statut', 'الحالة'), tr('Source', 'المصدر')]}
                     rows={data.attendance.filter((a) => match(a.athletes?.full_name)).map((a) => [fmtDate(a.att_date), a.athletes?.full_name ?? '—',
                       a.status === 'present' ? <span key="s" className="text-green-400">{tr('Présent', 'حاضر')}</span> : <span key="s" className="text-orange-300">{tr('Absent', 'غائب')}</span>,
                       a.source === 'scan' ? tr('Scan', 'مسح') : tr('Manuel', 'يدوي')])} />
            )}
            {athleteTab === 'new' && (
              <Table head={[tr('Inscrit le', 'تاريخ التسجيل'), tr('Athlète', 'الرياضي'), tr('Téléphone', 'الهاتف')]}
                     rows={data.newAthletes.filter((a) => match(a.full_name, a.phone)).map((a) => [fmtDate(a.created_at), a.full_name, a.phone ?? '—'])} />
            )}
            {athleteTab === 'free' && (
              <Table head={[tr('Date', 'التاريخ'), tr('Personne', 'الشخص'), tr('Prix', 'السعر')]} alignEnd={[2]}
                     rows={data.freeSessions.filter((f) => match(f.passenger_name, f.athletes?.full_name)).map((f) => [fmtDate(f.session_date), f.athletes?.full_name ?? f.passenger_name ?? '—', money(f.price, 'in')])} />
            )}
            {athleteTab === 'debts' && (
              <Table head={[tr('Athlète', 'الرياضي'), tr('Dette', 'الدين')]} alignEnd={[1]} empty={tr('Aucune dette.', 'لا توجد ديون.')}
                     rows={data.outstanding.filter((o) => match(o.full_name)).map((o) => [o.full_name, money(o.remaining, 'debt')])} />
            )}
          </Panel>
        )}

        {/* ---- Sales ---- */}
        {section === 'sales' && (
          <Panel title={tr('Ventes', 'المبيعات')} icon={<ShoppingCart className="w-4 h-4" />} right={searchBox}>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <Kpi icon={<ShoppingCart className="w-4 h-4" />} label={tr('Total facturé', 'إجمالي الفواتير')} value={formatDZD(salesTotal)} tone="from-purple-500/15 border-purple-500/25" />
              <Kpi icon={<TrendingUp className="w-4 h-4" />} label={tr('Encaissé', 'المحصّل')} value={formatDZD(salesPaid)} tone="from-green-500/15 border-green-500/25" />
              <Kpi icon={<HandCoins className="w-4 h-4" />} label={tr('Crédit clients', 'ديون الزبائن')} value={formatDZD(salesTotal - salesPaid)} tone="from-orange-500/15 border-orange-500/25" />
            </div>
            <Table head={[tr('Date', 'التاريخ'), tr('N°', 'رقم'), tr('Client', 'الزبون'), tr('Statut', 'الحالة'), tr('Total', 'المجموع'), tr('Payé', 'مدفوع')]} alignEnd={[4, 5]}
                   rows={data.sales.filter((s) => match(s.invoice_number, s.customer_name)).map((s) => [fmtDate(s.creation_date), s.invoice_number, s.customer_name,
                     s.status === 'paid' ? <span key="s" className="text-green-400">{tr('Payée', 'مدفوعة')}</span> : <span key="s" className="text-orange-300">{tr('Dette', 'دين')}</span>,
                     money(s.total_amount), money(s.amount_paid, 'in')])} />
          </Panel>
        )}

        {/* ---- Purchases ---- */}
        {section === 'purchases' && (
          <Panel title={tr('Achats', 'المشتريات')} icon={<Truck className="w-4 h-4" />} right={searchBox}>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <Kpi icon={<Truck className="w-4 h-4" />} label={tr('Total acheté', 'إجمالي المشتريات')} value={formatDZD(purchTotal)} tone="from-pink-500/15 border-pink-500/25" />
              <Kpi icon={<TrendingDown className="w-4 h-4" />} label={tr('Payé', 'مدفوع')} value={formatDZD(purchPaid)} tone="from-red-500/15 border-red-500/25" />
              <Kpi icon={<HandCoins className="w-4 h-4" />} label={tr('Reste fournisseurs', 'المتبقي للموردين')} value={formatDZD(purchTotal - purchPaid)} tone="from-orange-500/15 border-orange-500/25" />
            </div>
            <Table head={[tr('Date', 'التاريخ'), tr('N°', 'رقم'), tr('Fournisseur', 'المورد'), tr('Total', 'المجموع'), tr('Payé', 'مدفوع'), tr('Reste', 'الباقي')]} alignEnd={[3, 4, 5]}
                   rows={data.purchases.filter((p) => match(p.invoice_number, p.suppliers?.name)).map((p) => [fmtDate(p.invoice_date), p.invoice_number, p.suppliers?.name ?? '—', money(p.total_amount), money(p.amount_paid, 'out'), p.total_amount - p.amount_paid > 0 ? money(p.total_amount - p.amount_paid, 'debt') : '—'])} />
          </Panel>
        )}

        {/* ---- Expenses ---- */}
        {section === 'expenses' && (
          <Panel title={tr('Dépenses', 'المصاريف')} icon={<Receipt className="w-4 h-4" />} right={searchBox}>
            <div className="flex flex-wrap gap-2 mb-4">
              <Chip active={expenseCat === 'all'} onClick={() => setExpenseCat('all')}>{tr('Toutes', 'الكل')}</Chip>
              {expCats.map((c) => <Chip key={c} active={expenseCat === c} onClick={() => setExpenseCat(c)}>{c}</Chip>)}
            </div>
            {expRows.length > 0 && (
              <div className="h-56 mb-4" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={expCats.map((c) => ({ name: c, value: data.expenseRows.filter((e) => (e.expense_categories?.name ?? tr('Sans catégorie', 'بدون فئة')) === c).reduce((s, e) => s + Number(e.amount), 0) }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(243,201,105,0.08)" />
                    <XAxis dataKey="name" tick={{ fill: 'rgba(243,201,105,0.6)', fontSize: 11 }} />
                    <YAxis tick={{ fill: 'rgba(243,201,105,0.6)', fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: '#151515', border: '1px solid rgba(243,201,105,0.3)', borderRadius: 10 }} formatter={(v: number) => formatDZD(v)} />
                    <Bar dataKey="value" name={tr('Montant', 'المبلغ')} radius={[6, 6, 0, 0]}>
                      {expCats.map((_, i) => <Cell key={i} fill={PIE[(i + 7) % PIE.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            <p className="text-sm mb-3 text-gym-gold/70">{tr('Total affiché', 'المجموع المعروض')} : {money(expRows.reduce((s, e) => s + Number(e.amount), 0), 'out')}</p>
            <Table head={[tr('Date', 'التاريخ'), tr('Nom', 'الاسم'), tr('Catégorie', 'الفئة'), tr('Notes', 'ملاحظات'), tr('Montant', 'المبلغ')]} alignEnd={[4]}
                   rows={expRows.map((e) => [fmtDate(e.expense_date), e.name, e.expense_categories?.name ?? tr('Sans catégorie', 'بدون فئة'), e.notes ?? '—', money(e.amount, 'out')])} />
          </Panel>
        )}

        {/* ---- Workers ---- */}
        {section === 'workers' && (
          <Panel title={tr('Salaires et acomptes', 'الرواتب والتسبيقات')} icon={<UserCog className="w-4 h-4" />} right={searchBox}>
            <p className="text-sm mb-3 text-gym-gold/70">{tr('Total', 'المجموع')} : {money(workerRows.reduce((s, e) => s + Number(e.amount), 0), 'out')}</p>
            <Table head={[tr('Date', 'التاريخ'), tr('Employé', 'العامل'), tr('Type', 'النوع'), tr('Détail', 'التفاصيل'), tr('Montant', 'المبلغ')]} alignEnd={[4]}
                   rows={workerRows.map((e) => [fmtDate(e.entry_date), e.label, SOURCE[e.source] ?? e.source, e.detail, money(e.amount, 'out')])} />
          </Panel>
        )}

        {/* ---- Caisse ---- */}
        {section === 'caisse' && (
          <Panel title={tr('Mouvements de caisse', 'حركات الصندوق')} icon={<Wallet className="w-4 h-4" />} right={searchBox}>
            <Table head={[tr('Date', 'التاريخ'), tr('Type', 'النوع'), tr('Description', 'الوصف'), tr('Montant', 'المبلغ')]} alignEnd={[3]}
                   rows={caisseRows.map((r) => [fmtDate(r.entry_date), SOURCE[r.source], r.label,
                     <span key="m" className={r.flow === 'in' ? 'text-green-400 font-semibold' : 'text-red-400 font-semibold'}>{r.flow === 'in' ? '+' : '−'}{formatDZD(r.amount)}</span>])} />
          </Panel>
        )}

        {/* ---- Stock ---- */}
        {section === 'stock' && (
          <Panel title={tr('Stock (état actuel)', 'المخزون (الحالة الحالية)')} icon={<Package className="w-4 h-4" />} right={searchBox}>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <Kpi icon={<Package className="w-4 h-4" />} label={tr('Produits', 'المنتجات')} value={data.products.length} tone="from-blue-500/15 border-blue-500/25" />
              <Kpi icon={<Wallet className="w-4 h-4" />} label={tr('Valeur du stock', 'قيمة المخزون')} value={formatDZD(stockValue)} tone="from-gym-gold/15 border-gym-gold/25" />
              <Kpi icon={<TrendingDown className="w-4 h-4" />} label={tr('Stock faible', 'مخزون منخفض')} value={lowStock.length} tone="from-orange-500/15 border-orange-500/25" />
            </div>
            <Table head={[tr('Produit', 'المنتج'), tr('Stock', 'المخزون'), tr('Prix d’achat', 'سعر الشراء'), tr('Prix de vente', 'سعر البيع'), tr('État', 'الحالة')]} alignEnd={[1, 2, 3]}
                   rows={data.products.filter((p) => match(p.name)).map((p) => {
                     const st = productStatus(p.current_stock, p.min_stock_level);
                     return [p.name, p.current_stock, formatDZD(p.real_price), formatDZD(p.sell_price),
                       <span key="s" className={st === 'in_stock' ? 'text-green-400' : st === 'out_of_stock' ? 'text-red-400' : 'text-orange-300'}>
                         {st === 'in_stock' ? tr('En stock', 'متوفر') : st === 'out_of_stock' ? tr('Rupture', 'نفد') : st === 'critical' ? tr('Critique', 'حرج') : tr('Faible', 'منخفض')}
                       </span>];
                   })} />
          </Panel>
        )}
      </div>
    </div>
  );
};
