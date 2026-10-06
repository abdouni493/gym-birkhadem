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
import { tr } from '@/lib/i18n';

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
            title: tr('Le compte de connexion n’a pas pu être supprimé', 'تعذر حذف حساب الدخول'),
            description: tr(`${describeError(e)} — l’employé n’a pas été supprimé.`, `${describeError(e)} — لم يتم حذف العامل.`),
            variant: 'destructive',
          });
          return;
        }
      }
      await deleteWorker(worker.id);
      toast({ title: tr('Employé supprimé', 'تم حذف العامل'), description: tr(`${worker.full_name} a été supprimé.`, `تم حذف ${worker.full_name}.`) });
      await load();
    } catch (e) {
      toast({ title: tr('Impossible de supprimer l’employé', 'تعذر حذف العامل'), description: describeError(e), variant: 'destructive' });
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
    <div className="min-h-screen bg-gym-black text-gym-gold p-0 md:p-2">
      <div className="max-w-7xl mx-auto space-y-4 md:space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold gradient-text">{tr('Employés', 'العمال')}</h1>
            <p className="text-gym-gold/60 mt-1">
              {tr('Gérez votre équipe, ses accès et sa paie.', 'إدارة فريقك وصلاحياته ورواتبه.')}
            </p>
          </div>
          {can('workers', 'create') && (
            <Button onClick={() => open('form', null)} className="bg-gym-gold text-gym-black hover:bg-gym-gold/90">
              <UserPlus className="w-4 h-4 me-2" />{tr('Nouvel employé', 'عامل جديد')}
            </Button>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat icon={<Users className="w-5 h-5" />} label={tr('Total des employés', 'إجمالي العمال')} value={stats.total} />
          <Stat icon={<UserCheck className="w-5 h-5" />} label={tr('Actif', 'نشط')} value={stats.active} />
          <Stat icon={<KeyRound className="w-5 h-5" />} label={tr('Avec connexion', 'لديهم حساب دخول')} value={stats.withLogin} />
          <Stat icon={<Wallet className="w-5 h-5" />} label={tr('Masse salariale mensuelle', 'كتلة الأجور الشهرية')} value={formatDZD(stats.payroll)} />
        </div>

        {/* Filters */}
        <Card className="bg-gym-gray border-gym-gold/20">
          <CardContent className="p-4 flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 text-gym-gold/50 w-4 h-4" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)}
                     placeholder={tr('Rechercher par nom, téléphone ou e-mail…', 'ابحث بالاسم أو الهاتف أو البريد…')}
                     className="ps-10 bg-gym-black border-gym-gold/30 text-gym-gold" />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-full md:w-44 bg-gym-black border-gym-gold/30 text-gym-gold">
                <SelectValue placeholder={tr('Rôle', 'الدور')} />
              </SelectTrigger>
              <SelectContent className="bg-gym-gray border-gym-gold/30 text-gym-gold">
                <SelectItem value="all">{tr('Tous les rôles', 'كل الأدوار')}</SelectItem>
                {roles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-40 bg-gym-black border-gym-gold/30 text-gym-gold">
                <SelectValue placeholder={tr('Statut', 'الحالة')} />
              </SelectTrigger>
              <SelectContent className="bg-gym-gray border-gym-gold/30 text-gym-gold">
                <SelectItem value="all">{tr('Tous les statuts', 'كل الحالات')}</SelectItem>
                <SelectItem value="active">{tr('Actif', 'نشط')}</SelectItem>
                <SelectItem value="inactive">{tr('Inactif', 'غير نشط')}</SelectItem>
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
              <p className="text-red-400 font-medium">{tr('Impossible de charger les employés', 'تعذر تحميل العمال')}</p>
              <p className="text-sm text-gym-gold/50">{error}</p>
              <Button variant="outline" onClick={load}
                      className="border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10">
                {tr('Réessayer', 'إعادة المحاولة')}
              </Button>
            </CardContent>
          </Card>
        ) : filtered.length === 0 ? (
          <Card className="bg-gym-gray border-gym-gold/20">
            <CardContent className="p-12 text-center space-y-2">
              <Users className="w-10 h-10 text-gym-gold/25 mx-auto" />
              <p className="text-gym-gold/60">
                {workers.length === 0 ? tr('Aucun employé pour le moment.', 'لا يوجد عمال بعد.') : tr('Aucun employé ne correspond aux filtres.', 'لا يوجد عمال مطابقون للتصفية.')}
              </p>
              {workers.length === 0 && can('workers', 'create') && (
                <Button onClick={() => open('form', null)} className="gym-button mt-2">
                  <UserPlus className="w-4 h-4 me-2" />{tr('Ajoutez votre premier employé', 'أضف أول عامل')}
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
