import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UserPlus, Search, Users, Wallet, KeyRound, UserCheck } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { usePermissions } from '@/contexts/AuthContext';
import { describeError } from '@/lib/supabase';
import { formatDZD } from '@/lib/utils';
import {
  Worker, Role, listWorkers, listRoles, deleteWorker, manageWorkerAccount,
} from '@/lib/api/workers';
import { WorkerCard } from '@/components/workers/WorkerCard';
import { WorkerFormDialog } from '@/components/workers/WorkerFormDialog';
import { WorkerViewDialog } from '@/components/workers/WorkerViewDialog';
import { PermissionsDialog } from '@/components/workers/PermissionsDialog';
import { AcompteDialog } from '@/components/workers/AcompteDialog';
import { AbsenceDialog } from '@/components/workers/AbsenceDialog';
import { WorkerPaymentDialog } from '@/components/workers/WorkerPaymentDialog';
import { AccountDialog } from '@/components/workers/AccountDialog';

type DialogKind = 'form' | 'view' | 'permissions' | 'acompte' | 'absence' | 'payment' | 'account' | null;

const Stat: React.FC<{ icon: React.ReactNode; label: string; value: string | number }> = ({ icon, label, value }) => (
  <Card className="bg-gym-gray border-gym-gold/20">
    <CardContent className="p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-gym-gold/15 flex items-center justify-center text-gym-gold shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gym-gold/50">{label}</p>
        <p className="text-lg font-bold text-gym-gold truncate">{value}</p>
      </div>
    </CardContent>
  </Card>
);

export const Workers: React.FC = () => {
  const { can } = usePermissions();

  const [workers, setWorkers] = useState<Worker[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const [dialog, setDialog] = useState<DialogKind>(null);
  const [selected, setSelected] = useState<Worker | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [w, r] = await Promise.all([listWorkers(), listRoles()]);
      setWorkers(w);
      setRoles(r);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const open = (kind: DialogKind, worker: Worker | null) => {
    setSelected(worker);
    setDialog(kind);
  };
  const close = () => setDialog(null);

  const handleDelete = async (worker: Worker) => {
    try {
      // Remove the auth user first: deleting the worker row nulls the FK, and
      // we would lose the handle needed to clean up the login account.
      if (worker.user_id) {
        try {
          await manageWorkerAccount({ action: 'delete', worker_id: worker.id });
        } catch (e) {
          toast({
            title: 'Login account could not be removed',
            description: `${describeError(e)} — the worker was not deleted.`,
            variant: 'destructive',
          });
          return;
        }
      }
      await deleteWorker(worker.id);
      toast({ title: 'Worker deleted', description: `${worker.full_name} was removed.` });
      await load();
    } catch (e) {
      toast({ title: 'Could not delete worker', description: describeError(e), variant: 'destructive' });
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return workers.filter((w) => {
      const matchesSearch = !q
        || w.full_name.toLowerCase().includes(q)
        || (w.phone ?? '').toLowerCase().includes(q)
        || (w.email ?? '').toLowerCase().includes(q);
      const matchesRole = roleFilter === 'all' || w.role_id === roleFilter;
      const matchesStatus = statusFilter === 'all' || w.status === statusFilter;
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [workers, search, roleFilter, statusFilter]);

  const stats = useMemo(() => ({
    total: workers.length,
    active: workers.filter((w) => w.status === 'active').length,
    withLogin: workers.filter((w) => w.user_id).length,
    payroll: workers
      .filter((w) => w.pay_enabled && w.pay_type === 'monthly')
      .reduce((s, w) => s + Number(w.pay_amount || 0), 0),
  }), [workers]);

  return (
    <div className="min-h-screen bg-gym-black text-gym-gold p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold gradient-text">Workers</h1>
            <p className="text-gym-gold/60 mt-1">
              Manage your team, their access, and their pay.
            </p>
          </div>
          {can('workers', 'create') && (
            <Button onClick={() => open('form', null)} className="bg-gym-gold text-gym-black hover:bg-gym-gold/90">
              <UserPlus className="w-4 h-4 mr-2" />New worker
            </Button>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat icon={<Users className="w-5 h-5" />} label="Total workers" value={stats.total} />
          <Stat icon={<UserCheck className="w-5 h-5" />} label="Active" value={stats.active} />
          <Stat icon={<KeyRound className="w-5 h-5" />} label="With login" value={stats.withLogin} />
          <Stat icon={<Wallet className="w-5 h-5" />} label="Monthly payroll" value={formatDZD(stats.payroll)} />
        </div>

        {/* Filters */}
        <Card className="bg-gym-gray border-gym-gold/20">
          <CardContent className="p-4 flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gym-gold/50 w-4 h-4" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)}
                     placeholder="Search by name, phone or email…"
                     className="pl-10 bg-gym-black border-gym-gold/30 text-gym-gold" />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-full md:w-44 bg-gym-black border-gym-gold/30 text-gym-gold">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent className="bg-gym-gray border-gym-gold/30 text-gym-gold">
                <SelectItem value="all">All roles</SelectItem>
                {roles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-40 bg-gym-black border-gym-gold/30 text-gym-gold">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="bg-gym-gray border-gym-gold/30 text-gym-gold">
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Content */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[0, 1, 2].map((i) => (
              <Card key={i} className="bg-gym-gray border-gym-gold/20 animate-pulse">
                <CardContent className="p-5 h-56" />
              </Card>
            ))}
          </div>
        ) : error ? (
          <Card className="bg-gym-gray border-red-500/30">
            <CardContent className="p-8 text-center space-y-3">
              <p className="text-red-400 font-medium">Could not load workers</p>
              <p className="text-sm text-gym-gold/50">{error}</p>
              <Button variant="outline" onClick={load}
                      className="border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10">
                Try again
              </Button>
            </CardContent>
          </Card>
        ) : filtered.length === 0 ? (
          <Card className="bg-gym-gray border-gym-gold/20">
            <CardContent className="p-12 text-center space-y-2">
              <Users className="w-10 h-10 text-gym-gold/25 mx-auto" />
              <p className="text-gym-gold/60">
                {workers.length === 0 ? 'No workers yet.' : 'No workers match your filters.'}
              </p>
              {workers.length === 0 && can('workers', 'create') && (
                <Button onClick={() => open('form', null)} className="gym-button mt-2">
                  <UserPlus className="w-4 h-4 mr-2" />Add your first worker
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((w) => (
              <WorkerCard
                key={w.id}
                worker={w}
                can={(action) => can('workers', action)}
                onView={(x) => open('view', x)}
                onEdit={(x) => open('form', x)}
                onDelete={handleDelete}
                onPermissions={(x) => open('permissions', x)}
                onAcompte={(x) => open('acompte', x)}
                onAbsence={(x) => open('absence', x)}
                onPayment={(x) => open('payment', x)}
                onAccount={(x) => open('account', x)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Dialogs */}
      <WorkerFormDialog isOpen={dialog === 'form'} onClose={close} worker={selected} onSaved={load} />
      <WorkerViewDialog isOpen={dialog === 'view'} onClose={close} worker={selected} />
      <PermissionsDialog isOpen={dialog === 'permissions'} onClose={close} worker={selected} onSaved={load} />
      <AcompteDialog isOpen={dialog === 'acompte'} onClose={close} worker={selected}
                     canDelete={can('workers', 'acompte')} />
      <AbsenceDialog isOpen={dialog === 'absence'} onClose={close} worker={selected}
                     canDelete={can('workers', 'absence')} />
      <WorkerPaymentDialog isOpen={dialog === 'payment'} onClose={close} worker={selected} onSaved={load} />
      <AccountDialog isOpen={dialog === 'account'} onClose={close} worker={selected}
                     onSaved={load} />
    </div>
  );
};
