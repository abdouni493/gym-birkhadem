import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { TrendingUp, TrendingDown, Scale, Printer, Search } from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import { formatDZD, cn } from '@/lib/utils';
import { describeError } from '@/lib/supabase';
import { usePermissions } from '@/contexts/AuthContext';
import {
  StreamEntry, RangePreset, DateRange, resolveRange, listRevenue, listExpenseStream,
} from '@/lib/api/caisse';
import { INTERFACE_BY_KEY } from '@/lib/permissions';

const today = () => new Date().toISOString().split('T')[0];

const SOURCE_LABELS: Record<string, string> = {
  subscription: 'Subscriptions',
  free_session: 'Séance libre',
  sale: 'Sales',
  cash_deposit: 'Deposits',
  expense: 'Expenses',
  worker_payment: 'Salaries',
  worker_acompte: 'Acomptes',
  purchase: 'Purchases',
  cash_withdraw: 'Withdrawals',
};

interface Combined extends StreamEntry {
  flow: 'in' | 'out';
}

const StatCard: React.FC<{
  icon: React.ReactNode; label: string; value: string; tone?: 'in' | 'out' | 'neutral';
}> = ({ icon, label, value, tone = 'neutral' }) => (
  <Card className="bg-gym-gray border-gym-gold/20">
    <CardContent className="p-4 flex items-center gap-3">
      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
        tone === 'in' ? 'bg-green-500/15 text-green-400'
        : tone === 'out' ? 'bg-red-500/15 text-red-400'
        : 'bg-gym-gold/15 text-gym-gold')}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gym-gold/50">{label}</p>
        <p className="text-lg font-bold truncate">{value}</p>
      </div>
    </CardContent>
  </Card>
);

/**
 * Reports.
 *
 * Every money movement in the app, tagged with the interface it came from, so
 * it can be filtered per interface (Athletes, Caisse, Workers, …) and drilled
 * into line by line. Data comes from the v_revenue_stream / v_expense_stream
 * views — the same source as the Caisse, so the two can never disagree.
 */
export const Reports: React.FC = () => {
  const { can } = usePermissions();

  const [preset, setPreset] = useState<RangePreset>('month');
  const [custom, setCustom] = useState<DateRange>({ from: today(), to: today() });
  const [ifaceFilter, setIfaceFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const [revenue, setRevenue] = useState<StreamEntry[]>([]);
  const [expenses, setExpenses] = useState<StreamEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => resolveRange(preset, custom), [preset, custom]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rev, exp] = await Promise.all([listRevenue(range), listExpenseStream(range)]);
      setRevenue(rev);
      setExpenses(exp);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { load(); }, [load]);

  const combined = useMemo<Combined[]>(() => [
    ...revenue.map((r) => ({ ...r, flow: 'in' as const })),
    ...expenses.map((r) => ({ ...r, flow: 'out' as const })),
  ].sort((a, b) => b.entry_date.localeCompare(a.entry_date)), [revenue, expenses]);

  /** Interfaces actually present in this period — no empty filter chips. */
  const interfaces = useMemo(() => {
    const keys = new Set(combined.map((c) => c.interface_key));
    return Array.from(keys).sort();
  }, [combined]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return combined.filter((c) => {
      const matchesIface = ifaceFilter === 'all' || c.interface_key === ifaceFilter;
      const matchesSearch = !q
        || c.label.toLowerCase().includes(q)
        || (c.detail ?? '').toLowerCase().includes(q)
        || (SOURCE_LABELS[c.source] ?? c.source).toLowerCase().includes(q);
      return matchesIface && matchesSearch;
    });
  }, [combined, ifaceFilter, search]);

  const totals = useMemo(() => {
    const inSum = filtered.filter((f) => f.flow === 'in').reduce((s, f) => s + Number(f.amount), 0);
    const outSum = filtered.filter((f) => f.flow === 'out').reduce((s, f) => s + Number(f.amount), 0);
    return { in: inSum, out: outSum, net: inSum - outSum };
  }, [filtered]);

  /** Per-source breakdown, for the chart and the summary list. */
  const bySource = useMemo(() => {
    const map = new Map<string, { source: string; label: string; flow: 'in' | 'out'; total: number; count: number }>();
    for (const f of filtered) {
      const cur = map.get(f.source) ?? {
        source: f.source, label: SOURCE_LABELS[f.source] ?? f.source, flow: f.flow, total: 0, count: 0,
      };
      cur.total += Number(f.amount);
      cur.count += 1;
      map.set(f.source, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [filtered]);

  const chartData = useMemo(() => bySource.map((s) => ({
    name: s.label,
    In: s.flow === 'in' ? s.total : 0,
    Out: s.flow === 'out' ? s.total : 0,
  })), [bySource]);

  return (
    <div className="min-h-screen bg-gym-black text-gym-gold p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold gradient-text">Reports</h1>
            <p className="text-gym-gold/60 mt-1">
              Every movement across the app, filterable by interface.
            </p>
          </div>
          {can('reports', 'export') && (
            <Button variant="outline" onClick={() => window.print()}
                    className="border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10 print:hidden">
              <Printer className="w-4 h-4 mr-2" />Print
            </Button>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard icon={<TrendingUp className="w-5 h-5" />} label="Total in" value={formatDZD(totals.in)} tone="in" />
          <StatCard icon={<TrendingDown className="w-5 h-5" />} label="Total out" value={formatDZD(totals.out)} tone="out" />
          <StatCard icon={<Scale className="w-5 h-5" />} label="Net"
                    value={formatDZD(totals.net)} tone={totals.net >= 0 ? 'in' : 'out'} />
        </div>

        {/* Filters */}
        <Card className="bg-gym-gray border-gym-gold/20 print:hidden">
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              {([
                ['today', 'Today'], ['week', 'Last 7 days'],
                ['month', 'Last 30 days'], ['custom', 'Custom period'], ['all', 'All time'],
              ] as [RangePreset, string][]).map(([key, label]) => (
                <Button key={key} size="sm" variant={preset === key ? 'default' : 'outline'}
                        onClick={() => setPreset(key)}
                        className={preset === key
                          ? 'bg-gym-gold text-gym-black hover:bg-gym-gold/90'
                          : 'border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10'}>
                  {label}
                </Button>
              ))}
            </div>

            {preset === 'custom' && (
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">From</Label>
                  <Input type="date" value={custom.from}
                         onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
                         className="bg-gym-black border-gym-gold/30 text-gym-gold w-44" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">To</Label>
                  <Input type="date" value={custom.to}
                         onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
                         className="bg-gym-black border-gym-gold/30 text-gym-gold w-44" />
                </div>
              </div>
            )}

            <Separator className="bg-gym-gold/15" />

            {/* Per-interface filter */}
            <div className="space-y-2">
              <Label className="text-xs text-gym-gold/50">Filter by interface</Label>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant={ifaceFilter === 'all' ? 'default' : 'outline'}
                        onClick={() => setIfaceFilter('all')}
                        className={ifaceFilter === 'all'
                          ? 'bg-gym-gold text-gym-black hover:bg-gym-gold/90'
                          : 'border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10'}>
                  All interfaces
                </Button>
                {interfaces.map((k) => (
                  <Button key={k} size="sm" variant={ifaceFilter === k ? 'default' : 'outline'}
                          onClick={() => setIfaceFilter(k)}
                          className={ifaceFilter === k
                            ? 'bg-gym-gold text-gym-black hover:bg-gym-gold/90'
                            : 'border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10'}>
                    {INTERFACE_BY_KEY[k]?.label ?? k}
                  </Button>
                ))}
              </div>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gym-gold/50 w-4 h-4" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)}
                     placeholder="Search details…"
                     className="pl-10 bg-gym-black border-gym-gold/30 text-gym-gold" />
            </div>

            <p className="text-xs text-gym-gold/40">
              {range.from} → {range.to} · {filtered.length} entr{filtered.length === 1 ? 'y' : 'ies'}
            </p>
          </CardContent>
        </Card>

        {error ? (
          <Card className="bg-gym-gray border-red-500/30">
            <CardContent className="p-8 text-center space-y-3">
              <p className="text-red-400 font-medium">Could not load reports</p>
              <p className="text-sm text-gym-gold/50">{error}</p>
              <Button variant="outline" onClick={load}
                      className="border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10">Try again</Button>
            </CardContent>
          </Card>
        ) : loading ? (
          <Card className="bg-gym-gray border-gym-gold/20">
            <CardContent className="p-12 text-center text-gym-gold/40">Loading…</CardContent>
          </Card>
        ) : (
          <>
            {/* Chart */}
            {chartData.length > 0 && (
              <Card className="bg-gym-gray border-gym-gold/20">
                <CardContent className="p-4">
                  <h2 className="text-sm font-semibold text-gym-gold/80 mb-4">Breakdown by source</h2>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(243,201,105,0.1)" />
                        <XAxis dataKey="name" tick={{ fill: 'rgba(243,201,105,0.6)', fontSize: 11 }} />
                        <YAxis tick={{ fill: 'rgba(243,201,105,0.6)', fontSize: 11 }} />
                        <Tooltip
                          contentStyle={{ background: '#1a1a1a', border: '1px solid rgba(243,201,105,0.3)', borderRadius: 8 }}
                          labelStyle={{ color: '#f3c969' }}
                          formatter={(v: number) => formatDZD(v)}
                        />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="In" fill="#4ade80" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Out" fill="#f87171" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Summary by source */}
            <Card className="bg-gym-gray border-gym-gold/20">
              <CardContent className="p-4">
                <h2 className="text-sm font-semibold text-gym-gold/80 mb-3">Summary</h2>
                {bySource.length === 0 ? (
                  <p className="text-sm text-gym-gold/40 py-6 text-center">Nothing in this period.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {bySource.map((s) => (
                      <div key={s.source}
                           className="flex items-center justify-between p-3 rounded-lg border border-gym-gold/15">
                        <div className="min-w-0">
                          <p className="text-sm truncate">{s.label}</p>
                          <p className="text-xs text-gym-gold/40">{s.count} entr{s.count === 1 ? 'y' : 'ies'}</p>
                        </div>
                        <span className={cn('text-sm font-semibold shrink-0',
                          s.flow === 'in' ? 'text-green-400' : 'text-red-400')}>
                          {s.flow === 'in' ? '+' : '−'}{formatDZD(s.total)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Detail */}
            <Card className="bg-gym-gray border-gym-gold/20">
              <CardContent className="p-4">
                <h2 className="text-sm font-semibold text-gym-gold/80 mb-3">
                  Details {ifaceFilter !== 'all' && `— ${INTERFACE_BY_KEY[ifaceFilter]?.label ?? ifaceFilter}`}
                </h2>
                {filtered.length === 0 ? (
                  <p className="text-sm text-gym-gold/40 py-8 text-center">
                    Nothing matches these filters.
                  </p>
                ) : (
                  <ScrollArea className="max-h-[520px]">
                    <div className="space-y-1.5 pr-2">
                      {filtered.map((f) => (
                        <div key={`${f.source}-${f.ref_id}`}
                             className="flex items-center gap-3 p-3 rounded-lg border border-gym-gold/15 hover:border-gym-gold/30 transition-colors">
                          <Badge variant="outline"
                                 className="border-gym-gold/25 text-gym-gold/60 text-[10px] h-5 shrink-0 hidden sm:flex">
                            {INTERFACE_BY_KEY[f.interface_key]?.label ?? f.interface_key}
                          </Badge>
                          <Badge variant="outline"
                                 className="border-gym-gold/20 text-gym-gold/50 text-[10px] h-5 shrink-0">
                            {SOURCE_LABELS[f.source] ?? f.source}
                          </Badge>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gym-gold/90 truncate">{f.label}</p>
                            {f.detail && <p className="text-xs text-gym-gold/40 truncate">{f.detail}</p>}
                          </div>
                          <span className="text-xs text-gym-gold/40 shrink-0 hidden md:block">{f.entry_date}</span>
                          <span className={cn('text-sm font-semibold shrink-0 w-28 text-right',
                            f.flow === 'in' ? 'text-green-400' : 'text-red-400')}>
                            {f.flow === 'in' ? '+' : '−'}{formatDZD(f.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
};
