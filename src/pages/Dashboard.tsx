import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth, usePermissions } from '@/contexts/AuthContext';
import { useTranslation } from '@/lib/i18n';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import {
  Users, Calendar, DollarSign, Package, AlertTriangle, Truck, Award, Wallet,
  TrendingUp, TrendingDown, Zap, Barcode, ShoppingCart, UserCog, RefreshCw,
  BellRing, CalendarClock, ChevronRight, User,
} from 'lucide-react';
import { supabase, describeError } from '@/lib/supabase';
import { getCaisseBalance } from '@/lib/api/caisse';
import { productStatus } from '@/lib/api/products';
import { formatDZD, cn } from '@/lib/utils';

interface ExpiryAlert { id: string; name: string; expiry: string; daysLeft: number; }
interface StockAlert { id: string; name: string; stock: number; status: string; }

interface Stats {
  athletes: number;
  activeAthletes: number;
  products: number;
  lowStock: number;
  workers: number;
  suppliers: number;
  freeSessionsToday: number;
  caisseIn: number;
  caisseOut: number;
  caisseBalance: number;
  expiryAlerts: ExpiryAlert[];
  stockAlerts: StockAlert[];
}

/** COUNT(*) with an optional equality filter — head:true fetches no rows. */
const count = async (table: string, eq?: [string, string]): Promise<number> => {
  const base = supabase.from(table).select('*', { count: 'exact', head: true });
  const q = eq ? base.eq(eq[0], eq[1]) : base;
  const { count: c, error } = await q;
  if (error) throw error;
  return c ?? 0;
};

const DAY = 86400000;
const daysLeftFrom = (iso: string): number => {
  const d = new Date(iso); d.setHours(0, 0, 0, 0);
  const t0 = new Date(); t0.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - t0.getTime()) / DAY);
};

export const Dashboard: React.FC = () => {
  const { user, language } = useAuth();
  const { canView, isAdmin } = usePermissions();
  const { t } = useTranslation(language);
  const navigate = useNavigate();

  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const today = new Date().toISOString().split('T')[0];

  const load = useCallback(async () => {
    setError(null);
    try {
      // Stock status is derived, so we need the rows, not just a count.
      const { data: products, error: pErr } = await supabase
        .from('products').select('id, name, current_stock, min_stock_level');
      if (pErr) throw pErr;
      const stockAlerts: StockAlert[] = (products ?? [])
        .map((p) => ({ id: p.id, name: p.name, stock: p.current_stock, status: productStatus(p.current_stock, p.min_stock_level) }))
        .filter((p) => p.status !== 'in_stock')
        .sort((a, b) => a.stock - b.stock)
        .slice(0, 6);
      const lowStock = (products ?? []).filter(
        (p) => productStatus(p.current_stock, p.min_stock_level) !== 'in_stock',
      ).length;

      // Expiring / expired subscriptions (soonest first).
      const { data: expData, error: eErr } = await supabase
        .from('athletes')
        .select('id, full_name, subscription_expiry')
        .not('subscription_expiry', 'is', null)
        .order('subscription_expiry', { ascending: true })
        .limit(60);
      if (eErr) throw eErr;
      const expiryAlerts: ExpiryAlert[] = (expData ?? [])
        .map((a) => ({ id: a.id, name: a.full_name, expiry: a.subscription_expiry, daysLeft: daysLeftFrom(a.subscription_expiry) }))
        .filter((a) => a.daysLeft <= 7)
        .slice(0, 6);

      const [athletes, activeAthletes, workers, suppliers, freeToday, balance] =
        await Promise.all([
          count('athletes'),
          count('athletes', ['subscription_status', 'active']),
          count('workers'),
          count('suppliers'),
          count('free_sessions', ['session_date', today]),
          getCaisseBalance().catch(() => ({ total_in: 0, total_out: 0, balance: 0 })),
        ]);

      setStats({
        athletes, activeAthletes,
        products: products?.length ?? 0, lowStock,
        workers, suppliers,
        freeSessionsToday: freeToday,
        caisseIn: balance.total_in, caisseOut: balance.total_out, caisseBalance: balance.balance,
        expiryAlerts, stockAlerts,
      });
    } catch (e) {
      setError(describeError(e));
    }
  }, [today]);

  useEffect(() => { load(); }, [load]);

  const quickActions = useMemo(() => {
    const all = [
      { key: 'athletes', label: t('athletes.title'), icon: Users, path: '/athletes', color: 'from-blue-500 to-blue-600' },
      { key: 'pos', label: t('pos.title'), icon: ShoppingCart, path: '/pos', color: 'from-green-500 to-green-600' },
      { key: 'subscriptions', label: t('subscriptions.title'), icon: Calendar, path: '/subscriptions', color: 'from-purple-500 to-purple-600' },
      { key: 'products', label: t('products.title'), icon: Package, path: '/products', color: 'from-orange-500 to-orange-600' },
      { key: 'caisse', label: 'Caisse', icon: Wallet, path: '/caisse', color: 'from-teal-500 to-teal-600' },
      { key: 'scanner', label: 'Scanner', icon: Barcode, path: '/scanner', color: 'from-yellow-500 to-yellow-600' },
      { key: 'workers', label: t('workers.title'), icon: UserCog, path: '/workers', color: 'from-indigo-500 to-indigo-600' },
    ];
    return all.filter((a) => canView(a.key));
  }, [canView, t]);

  const cards = useMemo(() => {
    if (!stats) return [];
    const defs = [
      { iface: 'athletes', title: t('dashX.statAthletes'), value: stats.athletes, desc: t('dashX.statTotalMembers'), icon: Users, tone: 'text-gym-gold bg-gym-gold/10' },
      { iface: 'athletes', title: t('dashX.statActive'), value: stats.activeAthletes, desc: t('dashX.statActiveSubs'), icon: Award, tone: 'text-green-400 bg-green-500/10' },
      { iface: 'products', title: t('dashX.statProducts'), value: stats.products, desc: t('dashX.statInInventory'), icon: Package, tone: 'text-gym-gold bg-gym-gold/10' },
      { iface: 'products', title: t('dashX.statLowStock'), value: stats.lowStock, desc: t('dashX.statNeedRestock'), icon: AlertTriangle, tone: 'text-orange-400 bg-orange-500/10' },
      { iface: 'workers', title: t('dashX.statWorkers'), value: stats.workers, desc: t('dashX.statTeam'), icon: Users, tone: 'text-gym-gold bg-gym-gold/10' },
      { iface: 'suppliers', title: t('dashX.statSuppliers'), value: stats.suppliers, desc: t('dashX.statActiveSuppliers'), icon: Truck, tone: 'text-gym-gold bg-gym-gold/10' },
      { iface: 'athletes', title: t('dashX.statSeances'), value: stats.freeSessionsToday, desc: t('dashX.statFreeSessions'), icon: Zap, tone: 'text-gym-gold bg-gym-gold/10' },
      { iface: 'caisse', title: t('dashX.statCaisse'), value: formatDZD(stats.caisseBalance), desc: t('dashX.statBalance'), icon: Wallet, tone: 'text-gym-gold bg-gym-gold/10' },
    ];
    return defs.filter((d) => canView(d.iface));
  }, [stats, canView, t]);

  const statusTone = (s: string) =>
    s === 'out_of_stock' ? 'border-red-500/40 text-red-400 bg-red-500/5'
      : s === 'critical' ? 'border-orange-500/40 text-orange-400 bg-orange-500/5'
      : 'border-yellow-500/40 text-yellow-400 bg-yellow-500/5';
  const statusLabel = (s: string) =>
    s === 'out_of_stock' ? t('dashX.outOfStock') : s === 'critical' ? t('dashX.critical') : t('dashX.lowStockLabel');

  const expiryTone = (d: number) =>
    d < 0 ? 'border-red-500/40 text-red-400 bg-red-500/5' : 'border-orange-500/40 text-orange-400 bg-orange-500/5';
  const expiryLabel = (d: number) =>
    d < 0 ? t('dashX.expiredLabel') : d === 0 ? t('dashX.today') : `${t('dashX.expiresIn')} ${d} ${t('dashX.days')}`;

  const hasAlerts = stats && (stats.expiryAlerts.length > 0 || stats.stockAlerts.length > 0);

  return (
    <div className="min-h-screen bg-gym-black text-gym-gold-light p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3 animate-fade-in">
          <div>
            <h1 className="text-4xl font-bold gradient-text mb-2">
              {t('dashX.welcome')}, {user?.firstName}! 💪
            </h1>
            <p className="text-gym-gold/60 text-lg">{t('dashX.glance')}</p>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold text-gym-gold">
              {new Date().toLocaleDateString(language === 'ar' ? 'ar' : language === 'fr' ? 'fr-FR' : 'en-US',
                { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
        </div>

        {error ? (
          <Card className="bg-gym-gray border-red-500/30">
            <CardContent className="p-8 text-center space-y-3">
              <p className="text-red-400 font-medium">{t('dashX.couldNotLoad')}</p>
              <p className="text-sm text-gym-gold/50">{error}</p>
              <Button variant="outline" onClick={load} className="border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10">{t('dashX.tryAgain')}</Button>
            </CardContent>
          </Card>
        ) : !stats ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <Card key={i} className="bg-gym-gray border-gym-gold/20 animate-pulse"><CardContent className="h-28" /></Card>
            ))}
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {cards.map((stat, i) => {
                const Icon = stat.icon;
                return (
                  <Card key={stat.title}
                        style={{ animationDelay: `${i * 40}ms` }}
                        className="bg-gym-gray border-gym-gold/20 hover:border-gym-gold/50 hover:shadow-lg hover:shadow-gym-gold/5 transition-all animate-fade-in">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-gym-gold/80">{stat.title}</CardTitle>
                      <div className={cn('p-2 rounded-lg', stat.tone)}><Icon className="h-4 w-4" /></div>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold text-gym-gold mb-1">{stat.value}</div>
                      <p className="text-xs text-gym-gold/50">{stat.desc}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Alerts */}
            {hasAlerts && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <BellRing className="w-5 h-5 text-gym-gold" />
                  <h2 className="text-xl font-bold text-gym-gold">{t('dashX.alerts')}</h2>
                  <span className="text-sm text-gym-gold/50">— {t('dashX.alertsDesc')}</span>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Expiring subscriptions */}
                  {canView('athletes') && stats.expiryAlerts.length > 0 && (
                    <Card className="bg-gym-gray border-orange-500/25 animate-fade-in">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-gym-gold flex items-center gap-2 text-base">
                          <CalendarClock className="w-5 h-5 text-orange-400" />{t('dashX.expiredSubs')}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {stats.expiryAlerts.map((a) => (
                          <button key={a.id} onClick={() => navigate('/athletes')}
                                  className="w-full flex items-center justify-between gap-3 p-2.5 rounded-lg border border-gym-gold/10 hover:border-gym-gold/30 hover:bg-gym-gold/5 transition-all text-left group">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-9 h-9 rounded-full bg-gym-gold/15 flex items-center justify-center shrink-0">
                                <User className="w-4 h-4 text-gym-gold/60" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gym-gold truncate">{a.name}</p>
                                <p className="text-xs text-gym-gold/40">{a.expiry}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge variant="outline" className={cn('text-[10px] h-5', expiryTone(a.daysLeft))}>{expiryLabel(a.daysLeft)}</Badge>
                              <span className="inline-flex items-center gap-1 text-xs text-gym-gold/60 group-hover:text-gym-gold">
                                <RefreshCw className="w-3.5 h-3.5" />{t('dashX.renew')}
                              </span>
                            </div>
                          </button>
                        ))}
                        <Button variant="ghost" onClick={() => navigate('/athletes')}
                                className="w-full text-gym-gold/60 hover:text-gym-gold hover:bg-gym-gold/10 mt-1">
                          {t('dashX.viewAll')}<ChevronRight className="w-4 h-4 ml-1" />
                        </Button>
                      </CardContent>
                    </Card>
                  )}

                  {/* Stock alerts */}
                  {canView('products') && stats.stockAlerts.length > 0 && (
                    <Card className="bg-gym-gray border-orange-500/25 animate-fade-in">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-gym-gold flex items-center gap-2 text-base">
                          <Package className="w-5 h-5 text-orange-400" />{t('dashX.stockAlerts')}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {stats.stockAlerts.map((p) => (
                          <button key={p.id} onClick={() => navigate('/products')}
                                  className="w-full flex items-center justify-between gap-3 p-2.5 rounded-lg border border-gym-gold/10 hover:border-gym-gold/30 hover:bg-gym-gold/5 transition-all text-left">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-9 h-9 rounded-lg bg-gym-gold/15 flex items-center justify-center shrink-0">
                                <Package className="w-4 h-4 text-gym-gold/60" />
                              </div>
                              <p className="text-sm font-medium text-gym-gold truncate">{p.name}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-xs text-gym-gold/50">{p.stock} {t('dashX.unitsLeft')}</span>
                              <Badge variant="outline" className={cn('text-[10px] h-5', statusTone(p.status))}>{statusLabel(p.status)}</Badge>
                            </div>
                          </button>
                        ))}
                        <Button variant="ghost" onClick={() => navigate('/products')}
                                className="w-full text-gym-gold/60 hover:text-gym-gold hover:bg-gym-gold/10 mt-1">
                          {t('dashX.viewAll')}<ChevronRight className="w-4 h-4 ml-1" />
                        </Button>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
            )}

            {/* Cash flow (only if caisse visible) */}
            {canView('caisse') && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="bg-gym-gray border-gym-gold/20 hover-lift">
                  <CardContent className="p-5 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-green-500/15 flex items-center justify-center text-green-400"><TrendingUp className="w-5 h-5" /></div>
                    <div><p className="text-xs text-gym-gold/50">{t('dashX.totalIn')}</p><p className="text-lg font-bold text-green-400">{formatDZD(stats.caisseIn)}</p></div>
                  </CardContent>
                </Card>
                <Card className="bg-gym-gray border-gym-gold/20 hover-lift">
                  <CardContent className="p-5 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-red-500/15 flex items-center justify-center text-red-400"><TrendingDown className="w-5 h-5" /></div>
                    <div><p className="text-xs text-gym-gold/50">{t('dashX.totalOut')}</p><p className="text-lg font-bold text-red-400">{formatDZD(stats.caisseOut)}</p></div>
                  </CardContent>
                </Card>
                <Card className="bg-gym-gray border-gym-gold/20 hover-lift">
                  <CardContent className="p-5 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gym-gold/15 flex items-center justify-center text-gym-gold"><DollarSign className="w-5 h-5" /></div>
                    <div><p className="text-xs text-gym-gold/50">{t('dashX.balance')}</p><p className="text-lg font-bold text-gym-gold">{formatDZD(stats.caisseBalance)}</p></div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Quick actions */}
            {quickActions.length > 0 && (
              <Card className="bg-gym-gray border-gym-gold/20">
                <CardHeader>
                  <CardTitle className="text-gym-gold flex items-center"><Zap className="w-5 h-5 mr-2" />{t('dashX.quickActions')}</CardTitle>
                  <CardDescription className="text-gym-gold/60">{t('dashX.quickActionsDesc')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    {quickActions.map((a) => {
                      const Icon = a.icon;
                      return (
                        <Button key={a.key} onClick={() => navigate(a.path)} variant="ghost"
                                className={cn('p-4 h-auto rounded-lg bg-gradient-to-r hover:scale-105 transition-all duration-300 border-0', a.color)}>
                          <div className="flex flex-col items-center space-y-2">
                            <Icon className="w-6 h-6 text-white" />
                            <span className="text-xs text-white font-medium">{a.label}</span>
                          </div>
                        </Button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {!isAdmin && cards.length === 0 && quickActions.length === 0 && (
              <Card className="bg-gym-gray border-gym-gold/20">
                <CardContent className="p-12 text-center text-gym-gold/60">
                  {t('dashX.noPerms')}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
};
