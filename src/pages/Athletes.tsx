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
  MoreVertical, CreditCard, Dumbbell, UserCheck, AlertCircle, RefreshCw,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { formatDZD, cn } from '@/lib/utils';
import { describeError } from '@/lib/supabase';
import { usePermissions, useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/lib/i18n';
import { ViewToggle, ViewMode } from '@/components/common/ViewToggle';
import { Athlete, Sport, listAthletes, listSports, deleteAthlete } from '@/lib/api/athletes';
import { AthleteFormDialog } from '@/components/athletes/AthleteFormDialog';
import { SubscriptionDialog } from '@/components/athletes/SubscriptionDialog';
import { CreditDialog } from '@/components/athletes/CreditDialog';
import { FreeSessionDialog } from '@/components/athletes/FreeSessionDialog';

type DialogKind = 'form' | 'subscription' | 'credit' | 'freeSession' | null;

const isExpired = (iso: string | null): boolean => {
  if (!iso) return true;
  const d = new Date(iso); d.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return d < today;
};

const isActive = (a: Athlete) => a.subscription_status === 'active' && !isExpired(a.subscription_expiry);

export const Athletes: React.FC = () => {
  const { can } = usePermissions();
  const { language } = useAuth();
  const { t } = useTranslation(language);

  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [sports, setSports] = useState<Sport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sportFilter, setSportFilter] = useState('all');
  const [view, setView] = useState<ViewMode>('cards');

  const [dialog, setDialog] = useState<DialogKind>(null);
  const [selected, setSelected] = useState<Athlete | null>(null);
  const [subMode, setSubMode] = useState<'assign' | 'renew'>('assign');
  const [toDelete, setToDelete] = useState<Athlete | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [a, s] = await Promise.all([listAthletes(), listSports()]);
      setAthletes(a);
      setSports(s);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Defer the actual dialog open by a frame. When triggered from a dropdown
  // item this lets Radix finish tearing the menu down before the dialog locks
  // the page — avoiding the pointer-events race that froze the UI.
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return athletes.filter((a) => {
      const matchesSearch = !q || a.full_name.toLowerCase().includes(q)
        || (a.phone ?? '').toLowerCase().includes(q) || (a.email ?? '').toLowerCase().includes(q);
      const active = isActive(a);
      const matchesStatus = statusFilter === 'all'
        || (statusFilter === 'active' && active) || (statusFilter === 'expired' && !active);
      const matchesSport = sportFilter === 'all' || a.sport_id === sportFilter;
      return matchesSearch && matchesStatus && matchesSport;
    });
  }, [athletes, search, statusFilter, sportFilter]);

  const stats = useMemo(() => ({
    total: athletes.length,
    active: athletes.filter(isActive).length,
    expired: athletes.filter((a) => !isActive(a)).length,
    credit: athletes.reduce((s, a) => s + Number(a.account_balance || 0), 0),
  }), [athletes]);

  const athleteOptions = useMemo(() => athletes.map((a) => ({ id: a.id, full_name: a.full_name })), [athletes]);

  const sportName = (id: string | null) => sports.find((s) => s.id === id)?.name;

  const StatusBadge: React.FC<{ athlete: Athlete }> = ({ athlete }) => {
    const active = isActive(athlete);
    return (
      <Badge variant="outline" className={cn('text-[10px] h-5',
        active ? 'border-green-500/40 text-green-400 bg-green-500/5' : 'border-red-500/40 text-red-400 bg-red-500/5')}>
        {active ? t('athX.active') : t('athX.expired')}
      </Badge>
    );
  };

  const rowMenu = (a: Athlete) => ([
    can('athletes', 'subscribe') && { key: 'subscription' as const, label: t('athX.subscription'), icon: CalendarCheck, run: () => open('subscription', a, 'assign') },
    can('athletes', 'credit') && { key: 'credit' as const, label: t('athX.addCredit'), icon: Wallet, run: () => open('credit', a) },
    can('athletes', 'edit') && { key: 'form' as const, label: t('athX.edit'), icon: Pencil, run: () => open('form', a) },
  ].filter(Boolean) as { key: string; label: string; icon: React.ComponentType<{ className?: string }>; run: () => void }[]);

  const ActionsMenu: React.FC<{ athlete: Athlete }> = ({ athlete }) => {
    const menu = rowMenu(athlete);
    if (menu.length === 0 && !can('athletes', 'delete')) return null;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost"
                  className="h-8 w-8 text-gym-gold/70 hover:text-gym-gold hover:bg-gym-gold/10"
                  aria-label={t('athX.colActions')}>
            <MoreVertical className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-gym-gray border-gym-gold/30 text-gym-gold-light">
          {menu.map((m) => (
            <DropdownMenuItem key={m.key} onSelect={m.run}
                              className="cursor-pointer focus:bg-gym-gold/15 focus:text-gym-gold">
              <m.icon className="w-4 h-4 mr-2" />{m.label}
            </DropdownMenuItem>
          ))}
          {can('athletes', 'delete') && (
            <>
              <DropdownMenuSeparator className="bg-gym-gold/20" />
              <DropdownMenuItem onSelect={() => requestAnimationFrame(() => setToDelete(athlete))}
                                className="cursor-pointer text-red-400 focus:bg-red-500/10 focus:text-red-400">
                <Trash2 className="w-4 h-4 mr-2" />{t('athX.delete')}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const Stat: React.FC<{ icon: React.ReactNode; label: string; value: string | number; tone?: string }> =
    ({ icon, label, value, tone }) => (
    <Card className="bg-gym-gray border-gym-gold/20 hover-lift">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center shrink-0', tone ?? 'bg-gym-gold/15 text-gym-gold')}>{icon}</div>
        <div className="min-w-0">
          <p className="text-xs text-gym-gold/50">{label}</p>
          <p className="text-lg font-bold text-gym-gold truncate">{value}</p>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-gym-black text-gym-gold-light p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 animate-fade-in">
          <div>
            <h1 className="text-3xl font-bold gradient-text">{t('athletes.title')}</h1>
            <p className="text-gym-gold/60 mt-1">{t('athX.subtitle')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ViewToggle mode={view} onChange={setView} cardsLabel={t('athX.cardsView')} tableLabel={t('athX.tableView')} />
            {can('athletes', 'free_session') && (
              <Button variant="outline" onClick={() => open('freeSession', null)}
                      className="border-gym-gold/40 text-gym-gold hover:bg-gym-gold/10">
                <Zap className="w-4 h-4 mr-2" />{t('athX.freeSession')}
              </Button>
            )}
            {can('athletes', 'create') && (
              <Button onClick={() => open('form', null)} className="bg-gym-gold text-gym-black hover:bg-gym-gold/90 shadow-lg shadow-gym-gold/10">
                <Plus className="w-4 h-4 mr-2" />{t('athX.newAthlete')}
              </Button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat icon={<Users className="w-5 h-5" />} label={t('athX.statTotal')} value={stats.total} />
          <Stat icon={<UserCheck className="w-5 h-5" />} label={t('athX.statActive')} value={stats.active} tone="bg-green-500/15 text-green-400" />
          <Stat icon={<AlertCircle className="w-5 h-5" />} label={t('athX.statExpired')} value={stats.expired} tone="bg-red-500/15 text-red-400" />
          <Stat icon={<Wallet className="w-5 h-5" />} label={t('athX.statCredit')} value={formatDZD(stats.credit)} />
        </div>

        {/* Filters */}
        <Card className="bg-gym-gray border-gym-gold/20">
          <CardContent className="p-4 flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gym-gold/50 w-4 h-4" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)}
                     placeholder={t('athX.search')}
                     className="pl-10 bg-gym-black border-gym-gold/30 text-gym-gold-light" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-40 bg-gym-black border-gym-gold/30 text-gym-gold-light">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gym-gray border-gym-gold/30 text-gym-gold-light">
                <SelectItem value="all">{t('athX.allStatuses')}</SelectItem>
                <SelectItem value="active">{t('athX.active')}</SelectItem>
                <SelectItem value="expired">{t('athX.expired')}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sportFilter} onValueChange={setSportFilter}>
              <SelectTrigger className="w-full md:w-40 bg-gym-black border-gym-gold/30 text-gym-gold-light">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gym-gray border-gym-gold/30 text-gym-gold-light">
                <SelectItem value="all">{t('athX.allSports')}</SelectItem>
                {sports.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Content */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <Card key={i} className="bg-gym-gray border-gym-gold/20 animate-pulse">
                <CardContent className="p-5 h-48" />
              </Card>
            ))}
          </div>
        ) : error ? (
          <Card className="bg-gym-gray border-red-500/30">
            <CardContent className="p-8 text-center space-y-3">
              <p className="text-red-400 font-medium">{t('athX.couldNotLoad')}</p>
              <p className="text-sm text-gym-gold/50">{error}</p>
              <Button variant="outline" onClick={load}
                      className="border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10">{t('athX.tryAgain')}</Button>
            </CardContent>
          </Card>
        ) : filtered.length === 0 ? (
          <Card className="bg-gym-gray border-gym-gold/20">
            <CardContent className="p-12 text-center space-y-2">
              <Users className="w-10 h-10 text-gym-gold/25 mx-auto" />
              <p className="text-gym-gold/60">
                {athletes.length === 0 ? t('athX.noAthletesYet') : t('athX.noMatch')}
              </p>
              {athletes.length === 0 && can('athletes', 'create') && (
                <Button onClick={() => open('form', null)} className="gym-button mt-2">
                  <Plus className="w-4 h-4 mr-2" />{t('athX.addFirst')}
                </Button>
              )}
            </CardContent>
          </Card>
        ) : view === 'table' ? (
          /* ---------------- Table view ---------------- */
          <Card className="bg-gym-gray border-gym-gold/20 overflow-hidden animate-fade-in">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-gym-gold/20 hover:bg-transparent">
                    <TableHead className="text-gym-gold/70">{t('athX.colName')}</TableHead>
                    <TableHead className="text-gym-gold/70">{t('athX.colContact')}</TableHead>
                    <TableHead className="text-gym-gold/70">{t('athX.colSport')}</TableHead>
                    <TableHead className="text-gym-gold/70">{t('athX.colStatus')}</TableHead>
                    <TableHead className="text-gym-gold/70">{t('athX.colExpiry')}</TableHead>
                    <TableHead className="text-gym-gold/70 text-right">{t('athX.colCredit')}</TableHead>
                    <TableHead className="text-gym-gold/70 text-right">{t('athX.colActions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((a) => {
                    const expired = !isActive(a);
                    return (
                      <TableRow key={a.id} className="border-gym-gold/10 hover:bg-gym-gold/5">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-gym-gold/15 flex items-center justify-center overflow-hidden shrink-0">
                              {a.photo_url
                                ? <img src={a.photo_url} alt="" className="w-full h-full object-cover" />
                                : <User className="w-4 h-4 text-gym-gold/50" />}
                            </div>
                            <span className="font-medium text-gym-gold">{a.full_name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-gym-gold/60 text-sm">{a.phone || a.email || '—'}</TableCell>
                        <TableCell className="text-gym-gold/60 text-sm">{sportName(a.sport_id) || '—'}</TableCell>
                        <TableCell><StatusBadge athlete={a} /></TableCell>
                        <TableCell className="text-gym-gold/60 text-sm">{a.subscription_expiry || t('athX.noExpiry')}</TableCell>
                        <TableCell className="text-right text-sm">
                          {a.account_balance > 0
                            ? <span className="text-green-400">{formatDZD(a.account_balance)}</span>
                            : <span className="text-gym-gold/40">—</span>}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-2">
                            {can('athletes', 'subscribe') && expired && (
                              <Button size="sm" onClick={() => open('subscription', a, 'renew')}
                                      className="h-8 bg-gym-gold text-gym-black hover:bg-gym-gold/90">
                                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />{t('athX.renew')}
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
          /* ---------------- Card view ---------------- */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((a, i) => {
              const expired = !isActive(a);
              return (
                <Card key={a.id}
                      style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
                      className="bg-gym-gray border-gym-gold/20 hover:border-gym-gold/50 hover:shadow-lg hover:shadow-gym-gold/5 transition-all overflow-hidden animate-fade-in">
                  <CardContent className="p-0">
                    {/* Banner */}
                    <div className="h-16 bg-gradient-to-r from-gym-gold/25 to-gym-gold/5 relative">
                      <div className="absolute -bottom-8 left-4 w-16 h-16 rounded-full ring-4 ring-gym-gray bg-gym-gold/15 flex items-center justify-center overflow-hidden">
                        {a.photo_url
                          ? <img src={a.photo_url} alt="" className="w-full h-full object-cover" />
                          : <User className="w-7 h-7 text-gym-gold/50" />}
                      </div>
                      <div className="absolute top-2 right-2"><ActionsMenu athlete={a} /></div>
                    </div>

                    <div className="pt-10 px-4 pb-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="font-semibold text-gym-gold truncate">{a.full_name}</h3>
                          {sportName(a.sport_id) && (
                            <span className="inline-flex items-center gap-1 text-xs text-gym-gold/50">
                              <Dumbbell className="w-3 h-3" />{sportName(a.sport_id)}
                            </span>
                          )}
                        </div>
                        <StatusBadge athlete={a} />
                      </div>

                      <div className="space-y-1 text-xs text-gym-gold/60">
                        <div className="flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{a.phone || '—'}</span>
                        </div>
                        {a.subscription_expiry && (
                          <div className="flex items-center gap-2">
                            <CalendarCheck className="w-3.5 h-3.5 shrink-0" />
                            <span>{t('athX.expires')} {a.subscription_expiry}</span>
                          </div>
                        )}
                        {a.account_balance > 0 && (
                          <div className="flex items-center gap-2 text-green-400/80">
                            <CreditCard className="w-3.5 h-3.5 shrink-0" />
                            <span>{formatDZD(a.account_balance)} {t('athX.credit')}</span>
                          </div>
                        )}
                      </div>

                      {can('athletes', 'subscribe') && (
                        expired ? (
                          <Button size="sm" onClick={() => open('subscription', a, 'renew')}
                                  className="w-full bg-gym-gold text-gym-black hover:bg-gym-gold/90 font-semibold">
                            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />{t('athX.renew')}
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => open('subscription', a, 'assign')}
                                  className="w-full border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10">
                            <CalendarCheck className="w-3.5 h-3.5 mr-1.5" />{t('athX.subscription')}
                          </Button>
                        )
                      )}
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

      <AlertDialog open={toDelete !== null} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent className="bg-gym-gray border-gym-gold/20 text-gym-gold-light">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gym-gold">{t('athX.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription className="text-gym-gold/60">
              {toDelete?.full_name} — {t('athX.deleteDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10">{t('athX.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 text-white hover:bg-red-700">{t('athX.delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
