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
import { tr } from '@/lib/i18n';

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
        toast({ title: tr('Impossible de charger les rôles', 'تعذر تحميل الأدوار'), description: describeError(e), variant: 'destructive' });
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
      toast({ title: tr('Rôle créé', 'تم إنشاء الدور'), description: tr(`« ${r.name} » est maintenant disponible.`, `« ${r.name} » متاح الآن.`) });
    } catch (e) {
      toast({ title: tr('Impossible de créer le rôle', 'تعذر إنشاء الدور'), description: describeError(e), variant: 'destructive' });
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
      toast({ title: tr('Vérifiez le formulaire', 'تحقق من النموذج'), description: err, variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      if (isEdit && worker) {
        await updateWorker(worker.id, form);
        toast({ title: tr('Employé modifié', 'تم تعديل العامل'), description: tr(`${form.first_name} ${form.last_name} enregistré.`, `تم حفظ ${form.first_name} ${form.last_name}.`) });
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
              title: tr('Employé créé', 'تم إنشاء العامل'),
              description: tr(`${created.full_name} peut se connecter avec ${accEmail.trim().toLowerCase()}. Définissez ensuite ses permissions.`, `يمكن لـ ${created.full_name} الدخول بـ ${accEmail.trim().toLowerCase()}. حدد صلاحياته بعد ذلك.`),
            });
          } catch (accErr) {
            toast({
              title: tr('Employé créé, mais le compte de connexion a échoué', 'تم إنشاء العامل لكن فشل إنشاء حساب الدخول'),
              description: tr(`${describeError(accErr)} — vous pouvez réessayer depuis la carte de l’employé.`, `${describeError(accErr)} — يمكنك إعادة المحاولة من بطاقة العامل.`),
              variant: 'destructive',
            });
          }
        } else {
          toast({
            title: tr('Employé créé', 'تم إنشاء العامل'),
            description: tr(`${created.full_name} ajouté. Définissez ses permissions via l’action Permissions.`, `تمت إضافة ${created.full_name}. حدد صلاحياته من إجراء الصلاحيات.`),
          });
        }
      }
      onSaved();
      onClose();
    } catch (e) {
      toast({ title: tr('Impossible d’enregistrer l’employé', 'تعذر حفظ العامل'), description: describeError(e), variant: 'destructive' });
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
            {isEdit ? `Edit ${worker?.full_name}` : tr('Nouvel employé', 'عامل جديد')}
          </DialogTitle>
          <DialogDescription className="text-gym-gold/60">
            {isEdit
              ? tr('Modifiez les informations de cet employé.', 'عدّل معلومات هذا العامل.')
              : tr('L’employé est créé avec son rôle uniquement — accordez les permissions ensuite.', 'يُنشأ العامل بدوره فقط — امنح الصلاحيات لاحقًا.')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-5">
          {/* ---- Identity ---- */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gym-gold/50">{tr('Informations', 'المعلومات')}</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{tr('Prénom', 'الاسم')} *</Label>
                <Input value={form.first_name} onChange={(e) => set('first_name', e.target.value)}
                       className="gym-input" placeholder="Ahmed" />
              </div>
              <div className="space-y-1.5">
                <Label>{tr('Nom', 'اللقب')} *</Label>
                <Input value={form.last_name} onChange={(e) => set('last_name', e.target.value)}
                       className="gym-input" placeholder="Benali" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{tr('Date de naissance', 'تاريخ الميلاد')}</Label>
                <Input type="date" value={form.birthday ?? ''}
                       onChange={(e) => set('birthday', e.target.value || null)} className="gym-input" />
              </div>
              <div className="space-y-1.5">
                <Label>{tr('N° de carte d’identité', 'رقم بطاقة التعريف')} <span className="text-gym-gold/40">{tr('(optionnel)', '(اختياري)')}</span></Label>
                <Input value={form.id_card_number ?? ''}
                       onChange={(e) => set('id_card_number', e.target.value)} className="gym-input" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{tr('Téléphone', 'الهاتف')} *</Label>
                <Input value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)}
                       className="gym-input" placeholder="0555 00 00 00" />
              </div>
              <div className="space-y-1.5">
                <Label>{tr('Date de début de travail', 'تاريخ بداية العمل')} *</Label>
                <Input type="date" value={form.start_date}
                       onChange={(e) => set('start_date', e.target.value)} className="gym-input" />
              </div>
            </div>
          </section>

          <Separator className="bg-gym-gold/15" />

          {/* ---- Role ---- */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gym-gold/50">{tr('Rôle', 'الدور')}</h3>
            <Select value={form.role_id ?? undefined} onValueChange={(v) => set('role_id', v)}>
              <SelectTrigger className="gym-input"><SelectValue placeholder={tr('Choisir un rôle', 'اختر دورًا')} /></SelectTrigger>
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
                     placeholder={tr('Créer un nouveau rôle…', 'إنشاء دور جديد…')} className="gym-input"
                     onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddRole(); } }} />
              <Button type="button" variant="outline" onClick={handleAddRole}
                      disabled={addingRole || !newRole.trim()}
                      className="border-gym-gold/40 text-gym-gold hover:bg-gym-gold/10 shrink-0">
                <Plus className="w-4 h-4 me-1" />{tr('Ajouter', 'إضافة')}
              </Button>
            </div>
          </section>

          <Separator className="bg-gym-gold/15" />

          {/* ---- Pay ---- */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gym-gold/50">{tr('Paiement', 'الدفع')}</h3>
                <p className="text-xs text-gym-gold/40 mt-1">{tr('Cet employé est-il payé via l’application ?', 'هل يُدفع لهذا العامل عبر التطبيق؟')}</p>
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
                    <Label htmlFor="pay-monthly" className="cursor-pointer">{tr('Par mois', 'بالشهر')}</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="daily" id="pay-daily" className="border-gym-gold/50 text-gym-gold" />
                    <Label htmlFor="pay-daily" className="cursor-pointer">{tr('Par jour', 'باليوم')}</Label>
                  </div>
                </RadioGroup>

                <div className="space-y-1.5">
                  <Label>{form.pay_type === 'daily' ? tr('Montant par jour (DA)', 'المبلغ لليوم (دج)') : tr('Montant par mois (DA)', 'المبلغ للشهر (دج)')} *</Label>
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
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-gym-gold/50">{tr('Compte de connexion', 'حساب الدخول')}</h3>
                    <p className="text-xs text-gym-gold/40 mt-1">{tr('Cet employé peut-il se connecter à l’application ?', 'هل يمكن لهذا العامل الدخول إلى التطبيق؟')}</p>
                  </div>
                  <Switch checked={wantAccount} onCheckedChange={setWantAccount} />
                </div>

                {wantAccount && (
                  <div className="space-y-3 rounded-lg border border-gym-gold/20 p-3">
                    <div className="space-y-1.5">
                      <Label>{tr('E-mail', 'البريد الإلكتروني')} *</Label>
                      <Input type="email" value={accEmail} onChange={(e) => setAccEmail(e.target.value)}
                             className="gym-input" placeholder="ahmed@gym.com" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{tr('Nom d’utilisateur', 'اسم المستخدم')} <span className="text-gym-gold/40">{tr('(optionnel)', '(اختياري)')}</span></Label>
                      <Input value={accUser} onChange={(e) => setAccUser(e.target.value)}
                             className="gym-input" placeholder="ahmed" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{tr('Mot de passe', 'كلمة المرور')} *</Label>
                      <div className="relative">
                        <Input type={showPass ? 'text' : 'password'} value={accPass}
                               onChange={(e) => setAccPass(e.target.value)}
                               className="gym-input pe-10" placeholder={tr('Au moins 8 caractères', '8 أحرف على الأقل')} />
                        <button type="button" onClick={() => setShowPass(!showPass)}
                                className="absolute end-3 top-1/2 -translate-y-1/2 text-gym-gold/60 hover:text-gym-gold"
                                aria-label={showPass ? tr('Masquer le mot de passe', 'إخفاء كلمة المرور') : tr('Afficher le mot de passe', 'إظهار كلمة المرور')}>
                          {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 text-[11px] text-gym-gold/40">
                      <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <p>{tr('Il ne verra rien tant que vous n’accordez pas de permissions.', 'لن يرى شيئًا حتى تمنحه الصلاحيات.')}</p>
                    </div>
                  </div>
                )}
              </section>
            </>
          )}

          <DialogFooter className="gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>{tr('Annuler', 'إلغاء')}</Button>
            <Button type="submit" className="gym-button" disabled={saving}>
              {saving ? tr('Enregistrement…', 'جارٍ الحفظ…') : isEdit ? tr('Enregistrer les modifications', 'حفظ التعديلات') : tr('Créer l’employé', 'إنشاء العامل')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
