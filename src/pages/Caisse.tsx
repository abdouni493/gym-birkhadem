import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Wallet, TrendingUp, TrendingDown, Plus, Trash2, ArrowDownCircle, ArrowUpCircle,
  Users, AlertCircle,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { formatDZD, cn } from '@/lib/utils';
import { describeError } from '@/lib/supabase';
import { usePermissions } from '@/contexts/AuthContext';
import {
  CashTransaction, CashDirection, StreamEntry, OutstandingRow, RangePreset, DateRange,
  resolveRange, listTransactions, addTransaction, deleteTransaction,
  listRevenue, listExpenseStream, listOutstanding, getCaisseBalance,
} from '@/lib/api/caisse';

const today = () => new Date().toISOString().split('T')[0];

const SOURCE_LABELS: Record<string, string> = {
  subscription: 'Subscription',
  free_session: 'Séance libre',
  sale: 'Sale',
  cash_deposit: 'Deposit',
  expense: 'Expense',
  worker_payment: 'Salary',
  worker_acompte: 'Acompte',
  purchase: 'Purchase',
  cash_withdraw: 'Withdrawal',
};

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

export const Caisse: React.FC = () => {
  const { can } = usePermissions();

  const [preset, setPreset] = useState<RangePreset>('today');
  const [custom, setCustom] = useState<DateRange>({ from: today(), to: today() });

  const [transactions, setTransactions] = useState<CashTransaction[]>([]);
  const [revenue, setRevenue] = useState<StreamEntry[]>([]);
  const [expenses, setExpenses] = useState<StreamEntry[]>([]);
  const [outstanding, setOutstanding] = useState<OutstandingRow[]>([]);
  const [balance, setBalance] = useState({ total_in: 0, total_out: 0, balance: 0 });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New transaction dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [direction, setDirection] = useState<CashDirection>('deposit');
  const [amount, setAmount] = useState('');
  const [txDate, setTxDate] = useState(today());
  const [desc, setDesc] = useState('');
  const [saving, setSaving] = useState(false);

  const range = useMemo(() => resolveRange(preset, custom), [preset, custom]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tx, rev, exp, out, bal] = await Promise.all([
        listTransactions(range),
        listRevenue(range),
        listExpenseStream(range),
        listOutstanding(),
        getCaisseBalance(),
      ]);
      setTransactions(tx); setRevenue(rev); setExpenses(exp);
      setOutstanding(out); setBalance(bal);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { load(); }, [load]);

  const periodIn = useMemo(() => revenue.reduce((s, r) => s + Number(r.amount), 0), [revenue]);
  const periodOut = useMemo(() => expenses.reduce((s, r) => s + Number(r.amount), 0), [expenses]);
  const totalDebt = useMemo(() => outstanding.reduce((s, r) => s + Number(r.remaining), 0), [outstanding]);

  const submitTx = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(amount);
    if (!value || value <= 0) {
      toast({ title: 'Enter an amount', description: 'Must be greater than zero.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await addTransaction({ direction, amount: value, transaction_date: txDate, description: desc || null });
      toast({
        title: direction === 'deposit' ? 'Deposit recorded' : 'Withdrawal recorded',
        description: formatDZD(value),
      });
      setAmount(''); setDesc(''); setTxDate(today());
      setDialogOpen(false);
      await load();
    } catch (err) {
      toast({ title: 'Could not save transaction', description: describeError(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const removeTx = async (id: string) => {
    try {
      await deleteTransaction(id);
      toast({ title: 'Transaction deleted' });
      await load();
    } catch (e) {
      toast({ title: 'Could not delete', description: describeError(e), variant: 'destructive' });
    }
  };

  const StreamList: React.FC<{ rows: StreamEntry[]; tone: 'in' | 'out' }> = ({ rows, tone }) => (
    rows.length === 0 ? (
      <p className="text-sm text-gym-gold/40 py-8 text-center">Nothing in this period.</p>
    ) : (
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={`${r.source}-${r.ref_id}`}
               className="flex items-center gap-3 p-3 rounded-lg border border-gym-gold/15 hover:border-gym-gold/30 transition-colors">
            <Badge variant="outline" className="border-gym-gold/25 text-gym-gold/60 text-[10px] h-5 shrink-0">
              {SOURCE_LABELS[r.source] ?? r.source}
            </Badge>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gym-gold/90 truncate">{r.label}</p>
              {r.detail && <p className="text-xs text-gym-gold/40 truncate">{r.detail}</p>}
            </div>
            <span className="text-xs text-gym-gold/40 shrink-0 hidden sm:block">{r.entry_date}</span>
            <span className={cn('text-sm font-semibold shrink-0', tone === 'in' ? 'text-green-400' : 'text-red-400')}>
              {tone === 'in' ? '+' : '−'}{formatDZD(r.amount)}
            </span>
          </div>
        ))}
      </div>
    )
  );

  return (
    <div className="min-h-screen bg-gym-black text-gym-gold p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold gradient-text">Caisse</h1>
            <p className="text-gym-gold/60 mt-1">Cash movements, balance and outstanding payments.</p>
          </div>
          {can('caisse', 'create') && (
            <Button onClick={() => setDialogOpen(true)} className="bg-gym-gold text-gym-black hover:bg-gym-gold/90">
              <Plus className="w-4 h-4 mr-2" />New transaction
            </Button>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {can('caisse', 'view_balance') && (
            <StatCard icon={<Wallet className="w-5 h-5" />} label="In the caisse"
                      value={formatDZD(balance.balance)} />
          )}
          <StatCard icon={<TrendingUp className="w-5 h-5" />} label="In (period)"
                    value={formatDZD(periodIn)} tone="in" />
          <StatCard icon={<TrendingDown className="w-5 h-5" />} label="Out (period)"
                    value={formatDZD(periodOut)} tone="out" />
          <StatCard icon={<AlertCircle className="w-5 h-5" />} label="Unpaid by athletes"
                    value={formatDZD(totalDebt)} tone="out" />
        </div>

        {/* Filters */}
        <Card className="bg-gym-gray border-gym-gold/20">
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              {([
                ['today', 'Today'], ['week', 'Last 7 days'],
                ['month', 'Last 30 days'], ['custom', 'Custom period'], ['all', 'All time'],
              ] as [RangePreset, string][]).map(([key, label]) => (
                <Button key={key} size="sm"
                        variant={preset === key ? 'default' : 'outline'}
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
                {custom.from > custom.to && (
                  <p className="text-xs text-red-400 pb-2">The start date is after the end date.</p>
                )}
              </div>
            )}

            <p className="text-xs text-gym-gold/40">
              Showing {range.from} → {range.to}
            </p>
          </CardContent>
        </Card>

        {error ? (
          <Card className="bg-gym-gray border-red-500/30">
            <CardContent className="p-8 text-center space-y-3">
              <p className="text-red-400 font-medium">Could not load the caisse</p>
              <p className="text-sm text-gym-gold/50">{error}</p>
              <Button variant="outline" onClick={load}
                      className="border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10">Try again</Button>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="revenue">
            <TabsList className="bg-gym-gray border border-gym-gold/20">
              <TabsTrigger value="revenue" className="data-[state=active]:bg-gym-gold data-[state=active]:text-gym-black">
                Money in ({revenue.length})
              </TabsTrigger>
              <TabsTrigger value="expenses" className="data-[state=active]:bg-gym-gold data-[state=active]:text-gym-black">
                Money out ({expenses.length})
              </TabsTrigger>
              {can('caisse', 'view_history') && (
                <TabsTrigger value="transactions" className="data-[state=active]:bg-gym-gold data-[state=active]:text-gym-black">
                  Transactions ({transactions.length})
                </TabsTrigger>
              )}
              <TabsTrigger value="outstanding" className="data-[state=active]:bg-gym-gold data-[state=active]:text-gym-black">
                Unpaid ({outstanding.length})
              </TabsTrigger>
            </TabsList>

            <Card className="bg-gym-gray border-gym-gold/20 mt-4">
              <CardContent className="p-4">
                {loading ? (
                  <p className="py-12 text-center text-gym-gold/40">Loading…</p>
                ) : (
                  <>
                    <TabsContent value="revenue" className="mt-0">
                      <StreamList rows={revenue} tone="in" />
                    </TabsContent>

                    <TabsContent value="expenses" className="mt-0">
                      <StreamList rows={expenses} tone="out" />
                    </TabsContent>

                    <TabsContent value="transactions" className="mt-0">
                      {transactions.length === 0 ? (
                        <p className="text-sm text-gym-gold/40 py-8 text-center">
                          No manual transactions in this period.
                        </p>
                      ) : (
                        <div className="space-y-1.5">
                          {transactions.map((t) => (
                            <div key={t.id}
                                 className="flex items-center gap-3 p-3 rounded-lg border border-gym-gold/15">
                              {t.direction === 'deposit'
                                ? <ArrowDownCircle className="w-4 h-4 text-green-400 shrink-0" />
                                : <ArrowUpCircle className="w-4 h-4 text-red-400 shrink-0" />}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm capitalize">{t.direction}</p>
                                {t.description && (
                                  <p className="text-xs text-gym-gold/40 truncate">{t.description}</p>
                                )}
                              </div>
                              <span className="text-xs text-gym-gold/40 shrink-0">{t.transaction_date}</span>
                              <span className={cn('text-sm font-semibold shrink-0',
                                t.direction === 'deposit' ? 'text-green-400' : 'text-red-400')}>
                                {t.direction === 'deposit' ? '+' : '−'}{formatDZD(t.amount)}
                              </span>
                              {can('caisse', 'delete') && (
                                <Button size="icon" variant="ghost" onClick={() => removeTx(t.id)}
                                        className="h-7 w-7 text-red-400 hover:bg-red-500/10 shrink-0"
                                        aria-label="Delete transaction">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="outstanding" className="mt-0">
                      {outstanding.length === 0 ? (
                        <p className="text-sm text-gym-gold/40 py-8 text-center">
                          Every athlete is paid up.
                        </p>
                      ) : (
                        <div className="space-y-1.5">
                          {outstanding.map((o) => (
                            <div key={o.subscription_id}
                                 className="flex items-center gap-3 p-3 rounded-lg border border-gym-gold/15">
                              <div className="w-8 h-8 rounded-full bg-gym-gold/15 flex items-center justify-center overflow-hidden shrink-0">
                                {o.photo_url
                                  ? <img src={o.photo_url} alt="" className="w-full h-full object-cover" />
                                  : <Users className="w-4 h-4 text-gym-gold/50" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm truncate">{o.full_name}</p>
                                <p className="text-xs text-gym-gold/40 truncate">
                                  {o.subscription_name} · {o.phone || 'no phone'}
                                </p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-xs text-gym-gold/40">
                                  {formatDZD(o.amount_paid)} / {formatDZD(o.price)}
                                </p>
                                <p className="text-sm font-semibold text-red-400">
                                  {formatDZD(o.remaining)} due
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </TabsContent>
                  </>
                )}
              </CardContent>
            </Card>
          </Tabs>
        )}
      </div>

      {/* New transaction */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-gym-gray border-gym-gold/20 text-gym-gold max-w-md">
          <DialogHeader>
            <DialogTitle className="gradient-text">New transaction</DialogTitle>
            <DialogDescription className="text-gym-gold/60">
              Record money put into or taken out of the caisse.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={submitTx} className="space-y-4">
            <RadioGroup value={direction} onValueChange={(v) => setDirection(v as CashDirection)}
                        className="grid grid-cols-2 gap-3">
              <label className={cn('flex items-center gap-2 rounded-lg border p-3 cursor-pointer transition-colors',
                direction === 'deposit' ? 'border-green-500/50 bg-green-500/10' : 'border-gym-gold/20')}>
                <RadioGroupItem value="deposit" className="border-gym-gold/50 text-gym-gold" />
                <ArrowDownCircle className="w-4 h-4 text-green-400" />
                <span className="text-sm">Deposit</span>
              </label>
              <label className={cn('flex items-center gap-2 rounded-lg border p-3 cursor-pointer transition-colors',
                direction === 'withdraw' ? 'border-red-500/50 bg-red-500/10' : 'border-gym-gold/20')}>
                <RadioGroupItem value="withdraw" className="border-gym-gold/50 text-gym-gold" />
                <ArrowUpCircle className="w-4 h-4 text-red-400" />
                <span className="text-sm">Withdraw</span>
              </label>
            </RadioGroup>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Amount (DZD) *</Label>
                <Input type="number" min="0" step="0.01" value={amount}
                       onChange={(e) => setAmount(e.target.value)} className="gym-input" placeholder="1000" />
              </div>
              <div className="space-y-1.5">
                <Label>Date *</Label>
                <Input type="date" value={txDate} onChange={(e) => setTxDate(e.target.value)} className="gym-input" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={desc} onChange={(e) => setDesc(e.target.value)}
                        className="gym-input min-h-[70px]" placeholder="What was this for?" />
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" className="gym-button" disabled={saving}>
                {saving ? 'Saving…' : 'Save transaction'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
