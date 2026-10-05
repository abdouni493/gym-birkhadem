import React, { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  User, Phone, CreditCard, Cake, CalendarDays, Wallet, Shield, KeyRound, Mail,
} from 'lucide-react';
import { formatDZD } from '@/lib/utils';
import { describeError } from '@/lib/supabase';
import { toast } from '@/hooks/use-toast';
import {
  Worker, listAcomptes, listAbsences, listPayments, getWorkerPermissions,
} from '@/lib/api/workers';
import { INTERFACE_BY_KEY } from '@/lib/permissions';
import { computeUnpaidPeriods, unsettled, AcompteRow, AbsenceRow, PaymentRow } from '@/lib/workerPay';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  worker: Worker | null;
}

const Row: React.FC<{ icon: React.ReactNode; label: string; value: React.ReactNode }> = ({ icon, label, value }) => (
  <div className="flex items-center gap-3 py-2">
    <div className="text-gym-gold/40 shrink-0">{icon}</div>
    <span className="text-xs text-gym-gold/50 w-32 shrink-0">{label}</span>
    <span className="text-sm text-gym-gold/90 min-w-0 break-words">{value}</span>
  </div>
);

/** Read-only summary of everything known about a worker. */
export const WorkerViewDialog: React.FC<Props> = ({ isOpen, onClose, worker }) => {
  const [acomptes, setAcomptes] = useState<AcompteRow[]>([]);
  const [absences, setAbsences] = useState<AbsenceRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [perms, setPerms] = useState<{ interface_key: string; action_key: string | null }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !worker) return;
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const [ac, ab, pay, pm] = await Promise.all([
          listAcomptes(worker.id), listAbsences(worker.id),
          listPayments(worker.id), getWorkerPermissions(worker.id),
        ]);
        if (!active) return;
        setAcomptes(ac); setAbsences(ab); setPayments(pay); setPerms(pm);
      } catch (e) {
        toast({ title: 'Could not load details', description: describeError(e), variant: 'destructive' });
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [isOpen, worker]);

  if (!worker) return null;

  const totalPaid = payments.reduce((s, p) => s + Number(p.final_amount), 0);
  const pendingAcomptes = unsettled(acomptes).reduce((s, a) => s + Number(a.amount), 0);
  const pendingAbsences = unsettled(absences).reduce((s, a) => s + Number(a.cost), 0);
  const unpaid = computeUnpaidPeriods(
    {
      payEnabled: worker.pay_enabled, payType: worker.pay_type,
      payAmount: Number(worker.pay_amount) || 0, startDate: worker.start_date,
    },
    payments,
  );

  const visibleIfaces = perms.filter((p) => p.action_key === null);
  const isAdmin = worker.roles?.is_admin === true;

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-gym-gray border-gym-gold/20 text-gym-gold max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="gradient-text">Worker details</DialogTitle>
          <DialogDescription className="text-gym-gold/60">
            Everything recorded for this worker.
          </DialogDescription>
        </DialogHeader>

        {/* Identity header */}
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gym-gold/15 flex items-center justify-center overflow-hidden shrink-0">
            {worker.photo_url
              ? <img src={worker.photo_url} alt="" className="w-full h-full object-cover" />
              : <User className="w-7 h-7 text-gym-gold/60" />}
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-gym-gold truncate">{worker.full_name}</h2>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <Badge className="bg-gym-gold/20 text-gym-gold border-0">{worker.roles?.name ?? 'No role'}</Badge>
              <Badge variant="outline"
                     className={worker.status === 'active'
                       ? 'border-green-500/40 text-green-400'
                       : 'border-gym-gold/30 text-gym-gold/50'}>
                {worker.status}
              </Badge>
              {worker.user_id && (
                <Badge variant="outline" className="border-blue-500/40 text-blue-300">
                  <KeyRound className="w-3 h-3 mr-1" />
                  {worker.account_active ? 'Login active' : 'Login disabled'}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <Separator className="bg-gym-gold/15" />

        {/* Information */}
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gym-gold/50 mb-1">Information</h3>
          <div className="divide-y divide-gym-gold/10">
            <Row icon={<Phone className="w-4 h-4" />} label="Phone" value={worker.phone || '—'} />
            <Row icon={<Cake className="w-4 h-4" />} label="Birthday" value={worker.birthday || '—'} />
            <Row icon={<CreditCard className="w-4 h-4" />} label="ID card" value={worker.id_card_number || '—'} />
            <Row icon={<Mail className="w-4 h-4" />} label="Email" value={worker.email || '—'} />
            <Row icon={<CalendarDays className="w-4 h-4" />} label="Started working" value={worker.start_date} />
          </div>
        </section>

        <Separator className="bg-gym-gold/15" />

        {/* Pay */}
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gym-gold/50 mb-1">Payment</h3>
          {!worker.pay_enabled ? (
            <p className="text-sm text-gym-gold/50 py-2">This worker is not paid through the app.</p>
          ) : (
            <>
              <div className="divide-y divide-gym-gold/10">
                <Row icon={<Wallet className="w-4 h-4" />} label="Rate"
                     value={`${formatDZD(worker.pay_amount)} / ${worker.pay_type === 'daily' ? 'day' : 'month'}`} />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
                <div className="rounded-lg border border-gym-gold/20 p-2.5">
                  <p className="text-[10px] uppercase text-gym-gold/40">Total paid</p>
                  <p className="text-sm font-semibold text-green-400">{formatDZD(totalPaid)}</p>
                </div>
                <div className="rounded-lg border border-gym-gold/20 p-2.5">
                  <p className="text-[10px] uppercase text-gym-gold/40">Unpaid {worker.pay_type === 'daily' ? 'days' : 'months'}</p>
                  <p className="text-sm font-semibold">{loading ? '…' : unpaid.length}</p>
                </div>
                <div className="rounded-lg border border-gym-gold/20 p-2.5">
                  <p className="text-[10px] uppercase text-gym-gold/40">Advances due</p>
                  <p className="text-sm font-semibold text-amber-300">{formatDZD(pendingAcomptes)}</p>
                </div>
                <div className="rounded-lg border border-gym-gold/20 p-2.5">
                  <p className="text-[10px] uppercase text-gym-gold/40">Absence costs</p>
                  <p className="text-sm font-semibold text-orange-300">{formatDZD(pendingAbsences)}</p>
                </div>
              </div>
            </>
          )}
        </section>

        <Separator className="bg-gym-gold/15" />

        {/* Permissions */}
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gym-gold/50 mb-2 flex items-center gap-2">
            <Shield className="w-3.5 h-3.5" />Access
          </h3>
          {isAdmin ? (
            <p className="text-sm text-gym-gold/70">Admin role — full access to everything.</p>
          ) : visibleIfaces.length === 0 ? (
            <p className="text-sm text-gym-gold/50">No interfaces granted yet.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {visibleIfaces.map((p) => {
                const nActions = perms.filter((x) => x.interface_key === p.interface_key && x.action_key !== null).length;
                return (
                  <Badge key={p.interface_key} variant="outline" className="border-gym-gold/30 text-gym-gold/80">
                    {INTERFACE_BY_KEY[p.interface_key]?.label ?? p.interface_key}
                    {nActions > 0 && <span className="ml-1 text-gym-gold/50">· {nActions}</span>}
                  </Badge>
                );
              })}
            </div>
          )}
        </section>

        {/* Recent payments */}
        {payments.length > 0 && (
          <>
            <Separator className="bg-gym-gold/15" />
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gym-gold/50 mb-2">Recent payments</h3>
              <ScrollArea className="max-h-[140px]">
                <div className="space-y-1.5 pr-2">
                  {payments.slice(0, 8).map((p) => (
                    <div key={p.id} className="flex justify-between text-xs p-2 rounded border border-gym-gold/10">
                      <span className="text-gym-gold/60">{p.period_start} → {p.period_end}</span>
                      <span className="font-semibold">{formatDZD(p.final_amount)}</span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </section>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
