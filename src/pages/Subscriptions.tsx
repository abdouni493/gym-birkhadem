import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, Pencil, Trash2, Calendar, Users } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { formatDZD } from '@/lib/utils';
import { describeError } from '@/lib/supabase';
import { usePermissions } from '@/contexts/AuthContext';
import {
  Subscription, SubscriptionInput, listSubscriptionTypes, createSubscriptionType,
  updateSubscriptionType, deleteSubscriptionType, subscriptionUsage,
} from '@/lib/api/athletes';
import { useLang } from '@/hooks/useLang';

export const Subscriptions: React.FC = () => {
  const { can } = usePermissions();
  const { tr } = useLang();
  const [types, setTypes] = useState<Subscription[]>([]);
  const [usage, setUsage] = useState<Record<string, { members: number }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Subscription | null>(null);
  const [form, setForm] = useState({ name: '', duration: '', sessions: '', price: '', open: false });
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<Subscription | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [t, u] = await Promise.all([listSubscriptionTypes(), subscriptionUsage()]);
      setTypes(t);
      setUsage(u);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => {
    const members = Object.values(usage).reduce((s, u) => s + u.members, 0);
    return { members };
  }, [usage]);

  const openNew = () => {
    setEditing(null); setForm({ name: '', duration: '', sessions: '', price: '', open: false });
    setDialogOpen(true);
  };
  const openEdit = (s: Subscription) => {
    setEditing(s);
    setForm({
      name: s.name,
      duration: s.duration === 0 ? '' : String(s.duration),
      sessions: s.sessions ? String(s.sessions) : '',
      price: String(s.price),
      open: s.is_open,
    });
    setDialogOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.price) {
      toast({ title: tr('Vérifiez le formulaire', 'تحقق من النموذج'), description: tr('Le nom et le prix sont obligatoires.', 'الاسم والسعر مطلوبان.'), variant: 'destructive' });
      return;
    }
    const payload: SubscriptionInput = {
      name: form.name.trim(),
      duration: parseInt(form.duration || '0', 10),
      sessions: form.open ? null : (form.sessions ? parseInt(form.sessions, 10) : null),
      price: parseFloat(form.price),
      is_open: form.open,
    };
    setSaving(true);
    try {
      if (editing) { await updateSubscriptionType(editing.id, payload); toast({ title: tr('Abonnement modifié', 'تم تعديل الاشتراك') }); }
      else { await createSubscriptionType(payload); toast({ title: tr('Abonnement créé', 'تم إنشاء الاشتراك') }); }
      setDialogOpen(false);
      await load();
    } catch (err) {
      toast({ title: tr('Enregistrement impossible', 'تعذر الحفظ'), description: describeError(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await deleteSubscriptionType(toDelete.id);
      toast({ title: tr('Abonnement supprimé', 'تم حذف الاشتراك') });
      setToDelete(null);
      await load();
    } catch (e) {
      toast({ title: tr('Suppression impossible', 'تعذر الحذف'), description: describeError(e), variant: 'destructive' });
    }
  };

  return (
    <div className="min-h-screen bg-gym-black text-gym-gold p-0 md:p-2">
      <div className="max-w-7xl mx-auto space-y-4 md:space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold gradient-text">{tr('Abonnements', 'الاشتراكات')}</h1>
            <p className="text-gym-gold/60 mt-1">{tr('Vos formules d’abonnement.', 'باقات الاشتراك الخاصة بك.')}</p>
          </div>
          {can('subscriptions', 'create') && (
            <Button onClick={openNew} className="bg-gym-gold text-gym-black hover:bg-gym-gold/90">
              <Plus className="w-4 h-4 me-2" />{tr('Nouvel abonnement', 'اشتراك جديد')}
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="bg-gym-gray border-gym-gold/20"><CardContent className="p-5 flex items-center justify-between">
            <div><p className="text-gym-gold/60 text-sm">{tr('Formules', 'الباقات')}</p><p className="text-2xl font-bold text-gym-gold">{types.length}</p></div>
            <Calendar className="w-8 h-8 text-blue-400" />
          </CardContent></Card>
          <Card className="bg-gym-gray border-gym-gold/20"><CardContent className="p-5 flex items-center justify-between">
            <div><p className="text-gym-gold/60 text-sm">{tr('Membres actifs', 'الأعضاء النشطون')}</p><p className="text-2xl font-bold text-green-400">{totals.members}</p></div>
            <Users className="w-8 h-8 text-green-400" />
          </CardContent></Card>
        </div>

        <Card className="bg-gym-gray border-gym-gold/20">
          <CardHeader>
            <CardTitle className="text-gym-gold">{tr('Formules', 'الباقات')}</CardTitle>
            <CardDescription className="text-gym-gold/60">{tr('Gérez vos types d’abonnement.', 'إدارة أنواع الاشتراكات.')}</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="py-8 text-center text-gym-gold/40">{tr('Chargement…', 'جارٍ التحميل…')}</p>
            ) : error ? (
              <div className="py-8 text-center space-y-3">
                <p className="text-red-400">{error}</p>
                <Button variant="outline" onClick={load} className="border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10">{tr('Réessayer', 'إعادة المحاولة')}</Button>
              </div>
            ) : types.length === 0 ? (
              <p className="py-8 text-center text-gym-gold/50">{tr('Aucune formule pour le moment.', 'لا توجد باقات بعد.')}</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-gym-gold/20">
                      <TableHead className="text-gym-gold text-start">{tr('Formule', 'الباقة')}</TableHead>
                      <TableHead className="text-gym-gold text-start">{tr('Durée', 'المدة')}</TableHead>
                      <TableHead className="text-gym-gold text-start">{tr('Séances', 'الحصص')}</TableHead>
                      <TableHead className="text-gym-gold text-start">{tr('Prix', 'السعر')}</TableHead>
                      <TableHead className="text-gym-gold text-start">{tr('Membres', 'الأعضاء')}</TableHead>
                      <TableHead className="text-gym-gold text-start">{tr('Actions', 'الإجراءات')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {types.map((s) => {
                      const u = usage[s.id] ?? { members: 0 };
                      return (
                        <TableRow key={s.id} className="border-gym-gold/10 hover:bg-gym-gold/5">
                          <TableCell className="text-gym-gold font-medium">{s.name}</TableCell>
                          <TableCell className="text-gym-gold">
                            {s.is_open ? tr('Ouvert', 'مفتوح') : `${s.duration} ${tr('jours', 'يوم')}`}
                          </TableCell>
                          <TableCell className="text-gym-gold">{s.sessions ?? '—'}</TableCell>
                          <TableCell className="text-gym-gold font-semibold">{formatDZD(s.price)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="bg-blue-500/20 text-blue-400 border-blue-500/30">{u.members}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {can('subscriptions', 'edit') && (
                                <Button size="icon" variant="ghost" onClick={() => openEdit(s)}
                                        className="h-7 w-7 text-gym-gold hover:bg-gym-gold/10" aria-label={tr('Modifier', 'تعديل')}>
                                  <Pencil className="w-4 h-4" />
                                </Button>
                              )}
                              {can('subscriptions', 'delete') && (
                                <Button size="icon" variant="ghost" onClick={() => setToDelete(s)}
                                        className="h-7 w-7 text-red-400 hover:bg-red-500/10" aria-label={tr('Supprimer', 'حذف')}>
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-gym-gray border-gym-gold/30 text-gym-gold">
          <DialogHeader>
            <DialogTitle className="gradient-text">{editing ? tr('Modifier l’abonnement', 'تعديل الاشتراك') : tr('Nouvel abonnement', 'اشتراك جديد')}</DialogTitle>
            <DialogDescription className="text-gym-gold/60">{tr('Définissez une formule d’abonnement.', 'حدد باقة اشتراك.')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>{tr('Nom', 'الاسم')} *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                     className="gym-input" placeholder={tr('Mensuel, Trimestriel…', 'شهري، فصلي…')} />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-gym-gold/20 p-3">
              <div>
                <Label className="cursor-pointer">{tr('Abonnement ouvert', 'اشتراك مفتوح')}</Label>
                <p className="text-[11px] text-gym-gold/40">{tr('Sans nombre de séances fixe', 'بدون عدد حصص محدد')}</p>
              </div>
              <Switch checked={form.open} onCheckedChange={(v) => setForm({ ...form, open: v })} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{tr('Durée (jours)', 'المدة (أيام)')}</Label>
                <Input type="number" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })}
                       className="gym-input" placeholder="30" />
              </div>
              {!form.open && (
                <div className="space-y-1.5">
                  <Label>{tr('Séances', 'الحصص')}</Label>
                  <Input type="number" value={form.sessions} onChange={(e) => setForm({ ...form, sessions: e.target.value })}
                         className="gym-input" placeholder="12" />
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>{tr('Prix (DA)', 'السعر (دج)')} *</Label>
              <Input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })}
                     className="gym-input" placeholder="5000" />
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)} disabled={saving}>{tr('Annuler', 'إلغاء')}</Button>
              <Button type="submit" className="gym-button" disabled={saving}>{saving ? tr('Enregistrement…', 'جارٍ الحفظ…') : tr('Enregistrer', 'حفظ')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={toDelete !== null} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent className="bg-gym-gray border-gym-gold/20 text-gym-gold">
          <AlertDialogHeader>
            <AlertDialogTitle>{tr('Supprimer', 'حذف')} {toDelete?.name} ?</AlertDialogTitle>
            <AlertDialogDescription className="text-gym-gold/60">
              {tr('Les abonnements déjà attribués aux athlètes sont conservés ; seule la formule est supprimée.', 'تبقى اشتراكات الرياضيين المسجلة كما هي؛ يتم حذف الباقة فقط.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10">{tr('Annuler', 'إلغاء')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 text-white hover:bg-red-700">{tr('Supprimer', 'حذف')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
