import React, { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { UserPlus, Plus, Eye, EyeOff, Info } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { describeError } from '@/lib/supabase';
import {
  Role, Worker, WorkerInput, listRoles, createRole, createWorker, updateWorker,
  manageWorkerAccount,
} from '@/lib/api/workers';
import type { PayType } from '@/lib/workerPay';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** null = create mode */
  worker: Worker | null;
  onSaved: () => void;
}

const today = () => new Date().toISOString().split('T')[0];

const blank = (): WorkerInput => ({
  first_name: '', last_name: '', birthday: null, id_card_number: null,
  phone: null, email: null, address: null, role_id: null,
  pay_enabled: false, pay_type: 'monthly', pay_amount: 0,
  start_date: today(), status: 'active',
});

/**
 * Create / edit a worker.
 *
 * Per spec a new worker gets their role but NO permissions — those are granted
 * afterwards from the Permissions action. Nothing here writes permissions.
 */
export const WorkerFormDialog: React.FC<Props> = ({ isOpen, onClose, worker, onSaved }) => {
  const isEdit = worker !== null;

  const [form, setForm] = useState<WorkerInput>(blank());
  const [roles, setRoles] = useState<Role[]>([]);
  const [newRole, setNewRole] = useState('');
  const [addingRole, setAddingRole] = useState(false);
  const [saving, setSaving] = useState(false);

  // Account section (create mode only; editing accounts happens from the card)
  const [wantAccount, setWantAccount] = useState(false);
  const [accEmail, setAccEmail] = useState('');
  const [accUser, setAccUser] = useState('');
  const [accPass, setAccPass] = useState('');
  const [showPass, setShowPass] = useState(false);

  const set = <K extends keyof WorkerInput>(k: K, v: WorkerInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    (async () => {
      try {
        const r = await listRoles();
        if (active) setRoles(r);
      } catch (e) {
        toast({ title: 'Could not load roles', description: describeError(e), variant: 'destructive' });
      }
    })();

    if (worker) {
      setForm({
        first_name: worker.first_name, last_name: worker.last_name,
        birthday: worker.birthday, id_card_number: worker.id_card_number,
        phone: worker.phone, email: worker.email, address: worker.address,
        photo_url: worker.photo_url, role_id: worker.role_id,
        pay_enabled: worker.pay_enabled, pay_type: worker.pay_type ?? 'monthly',
        pay_amount: Number(worker.pay_amount) || 0,
        start_date: worker.start_date, status: worker.status,
      });
    } else {
      setForm(blank());
    }
    setWantAccount(false);
    setAccEmail(''); setAccUser(''); setAccPass(''); setShowPass(false);
    return () => { active = false; };
  }, [isOpen, worker]);

  const handleAddRole = async () => {
    const name = newRole.trim();
    if (!name) return;
    setAddingRole(true);
    try {
      const r = await createRole(name);
      setRoles((prev) => [...prev, r].sort((a, b) => a.name.localeCompare(b.name)));
      set('role_id', r.id);
      setNewRole('');
      toast({ title: 'Role created', description: `"${r.name}" is now available.` });
    } catch (e) {
      toast({ title: 'Could not create role', description: describeError(e), variant: 'destructive' });
    } finally {
      setAddingRole(false);
    }
  };

  const validate = (): string | null => {
    if (!form.first_name.trim() || !form.last_name.trim()) return 'Full name is required.';
    if (!form.phone?.trim()) return 'Phone number is required.';
    if (!form.role_id) return 'Select a role.';
    if (!form.start_date) return 'Set the date this worker started.';
    if (form.pay_enabled) {
      if (!form.pay_type) return 'Choose whether pay is by day or by month.';
      if (!form.pay_amount || form.pay_amount <= 0) return 'Enter the pay amount.';
    }
    if (!isEdit && wantAccount) {
      if (!accEmail.trim()) return 'An email is required for the login account.';
      if (accPass.length < 8) return 'The account password must be at least 8 characters.';
    }
    return null;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate();
    if (err) {
      toast({ title: 'Check the form', description: err, variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      if (isEdit && worker) {
        await updateWorker(worker.id, form);
        toast({ title: 'Worker updated', description: `${form.first_name} ${form.last_name} saved.` });
      } else {
        const created = await createWorker({
          ...form,
          email: wantAccount ? accEmail.trim().toLowerCase() : form.email,
        });

        // The worker row exists even if the login account fails, so report the
        // two outcomes separately rather than failing the whole create.
        if (wantAccount) {
          try {
            await manageWorkerAccount({
              action: 'create',
              worker_id: created.id,
              email: accEmail.trim().toLowerCase(),
              password: accPass,
              username: accUser.trim() || undefined,
            });
            toast({
              title: 'Worker created',
              description: `${created.full_name} can sign in with ${accEmail.trim().toLowerCase()}. Set their permissions next.`,
            });
          } catch (accErr) {
            toast({
              title: 'Worker created, but the login account failed',
              description: `${describeError(accErr)} — you can retry from the worker's card.`,
              variant: 'destructive',
            });
          }
        } else {
          toast({
            title: 'Worker created',
            description: `${created.full_name} added. Set their permissions from the Permissions action.`,
          });
        }
      }
      onSaved();
      onClose();
    } catch (e) {
      toast({ title: 'Could not save worker', description: describeError(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-gym-gray border-gym-gold/20 text-gym-gold max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 gradient-text">
            <UserPlus className="w-5 h-5" />
            {isEdit ? `Edit ${worker?.full_name}` : 'New worker'}
          </DialogTitle>
          <DialogDescription className="text-gym-gold/60">
            {isEdit
              ? 'Update this worker’s details.'
              : 'The worker is created with their role only — grant permissions afterwards.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-5">
          {/* ---- Identity ---- */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gym-gold/50">Information</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>First name *</Label>
                <Input value={form.first_name} onChange={(e) => set('first_name', e.target.value)}
                       className="gym-input" placeholder="Ahmed" />
              </div>
              <div className="space-y-1.5">
                <Label>Last name *</Label>
                <Input value={form.last_name} onChange={(e) => set('last_name', e.target.value)}
                       className="gym-input" placeholder="Benali" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Birthday</Label>
                <Input type="date" value={form.birthday ?? ''}
                       onChange={(e) => set('birthday', e.target.value || null)} className="gym-input" />
              </div>
              <div className="space-y-1.5">
                <Label>ID card number <span className="text-gym-gold/40">(optional)</span></Label>
                <Input value={form.id_card_number ?? ''}
                       onChange={(e) => set('id_card_number', e.target.value)} className="gym-input" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Phone *</Label>
                <Input value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)}
                       className="gym-input" placeholder="0555 00 00 00" />
              </div>
              <div className="space-y-1.5">
                <Label>Started working on *</Label>
                <Input type="date" value={form.start_date}
                       onChange={(e) => set('start_date', e.target.value)} className="gym-input" />
              </div>
            </div>
          </section>

          <Separator className="bg-gym-gold/15" />

          {/* ---- Role ---- */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gym-gold/50">Role</h3>
            <Select value={form.role_id ?? undefined} onValueChange={(v) => set('role_id', v)}>
              <SelectTrigger className="gym-input"><SelectValue placeholder="Select a role" /></SelectTrigger>
              <SelectContent className="bg-gym-gray border-gym-gold/30 text-gym-gold">
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}{r.is_admin ? ' (full access)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex gap-2">
              <Input value={newRole} onChange={(e) => setNewRole(e.target.value)}
                     placeholder="Create a new role…" className="gym-input"
                     onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddRole(); } }} />
              <Button type="button" variant="outline" onClick={handleAddRole}
                      disabled={addingRole || !newRole.trim()}
                      className="border-gym-gold/40 text-gym-gold hover:bg-gym-gold/10 shrink-0">
                <Plus className="w-4 h-4 mr-1" />Add
              </Button>
            </div>
          </section>

          <Separator className="bg-gym-gold/15" />

          {/* ---- Pay ---- */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gym-gold/50">Payment</h3>
                <p className="text-xs text-gym-gold/40 mt-1">Is this worker paid through the app?</p>
              </div>
              <Switch checked={form.pay_enabled} onCheckedChange={(v) => set('pay_enabled', v)} />
            </div>

            {form.pay_enabled && (
              <div className="space-y-3 rounded-lg border border-gym-gold/20 p-3">
                <RadioGroup value={form.pay_type ?? 'monthly'}
                            onValueChange={(v) => set('pay_type', v as PayType)}
                            className="flex gap-6">
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="monthly" id="pay-monthly" className="border-gym-gold/50 text-gym-gold" />
                    <Label htmlFor="pay-monthly" className="cursor-pointer">By month</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="daily" id="pay-daily" className="border-gym-gold/50 text-gym-gold" />
                    <Label htmlFor="pay-daily" className="cursor-pointer">By day</Label>
                  </div>
                </RadioGroup>

                <div className="space-y-1.5">
                  <Label>Amount per {form.pay_type === 'daily' ? 'day' : 'month'} (DZD) *</Label>
                  <Input type="number" min={0} step="0.01" value={form.pay_amount || ''}
                         onChange={(e) => set('pay_amount', Number(e.target.value))}
                         className="gym-input" placeholder="30000" />
                </div>
              </div>
            )}
          </section>

          {/* ---- Login account (create mode only) ---- */}
          {!isEdit && (
            <>
              <Separator className="bg-gym-gold/15" />
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-gym-gold/50">Login account</h3>
                    <p className="text-xs text-gym-gold/40 mt-1">Can this worker sign in to the app?</p>
                  </div>
                  <Switch checked={wantAccount} onCheckedChange={setWantAccount} />
                </div>

                {wantAccount && (
                  <div className="space-y-3 rounded-lg border border-gym-gold/20 p-3">
                    <div className="space-y-1.5">
                      <Label>Email *</Label>
                      <Input type="email" value={accEmail} onChange={(e) => setAccEmail(e.target.value)}
                             className="gym-input" placeholder="ahmed@gym.com" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Username <span className="text-gym-gold/40">(optional)</span></Label>
                      <Input value={accUser} onChange={(e) => setAccUser(e.target.value)}
                             className="gym-input" placeholder="ahmed" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Password *</Label>
                      <div className="relative">
                        <Input type={showPass ? 'text' : 'password'} value={accPass}
                               onChange={(e) => setAccPass(e.target.value)}
                               className="gym-input pr-10" placeholder="At least 8 characters" />
                        <button type="button" onClick={() => setShowPass(!showPass)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gym-gold/60 hover:text-gym-gold"
                                aria-label={showPass ? 'Hide password' : 'Show password'}>
                          {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 text-[11px] text-gym-gold/40">
                      <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <p>They will see nothing until you grant permissions from the Permissions action.</p>
                    </div>
                  </div>
                )}
              </section>
            </>
          )}

          <DialogFooter className="gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" className="gym-button" disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create worker'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
