import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  User, Plus, Camera, Trash2, CalendarCheck, Check, X, Settings2, CreditCard,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { formatDZD } from '@/lib/utils';
import { describeError } from '@/lib/supabase';
import { uploadImage } from '@/lib/storage';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/lib/i18n';
import {
  Athlete, AthleteInput, Sport, Subscription,
  createAthlete, updateAthlete, listSports, createSport, deleteSport,
  listSubscriptionTypes, assignSubscription,
} from '@/lib/api/athletes';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  athlete: Athlete | null;
  onSaved: () => void;
  /** When true (create mode), the caller allows assigning a subscription inline. */
  canSubscribe?: boolean;
}

const blank = (): AthleteInput => ({
  first_name: '', last_name: '', email: null, phone: null,
  date_of_birth: null, gender: null, address: null, sport_id: null,
  rfid_uid: null, photo_url: null,
});

const today = () => new Date().toISOString().split('T')[0];
const NONE = '__none__';

export const AthleteFormDialog: React.FC<Props> = ({ isOpen, onClose, athlete, onSaved, canSubscribe }) => {
  const { language } = useAuth();
  const { t } = useTranslation(language);
  const isEdit = athlete !== null;

  const [form, setForm] = useState<AthleteInput>(blank());
  const [sports, setSports] = useState<Sport[]>([]);
  const [newSport, setNewSport] = useState('');
  const [manageSports, setManageSports] = useState(false);
  const [sportPendingDelete, setSportPendingDelete] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Inline subscription (create mode only)
  const [subTypes, setSubTypes] = useState<Subscription[]>([]);
  const [subTypeId, setSubTypeId] = useState(NONE);
  const [subPaymentDate, setSubPaymentDate] = useState(today());
  const [subAmountPaid, setSubAmountPaid] = useState('');

  const selectedSub = useMemo(
    () => (subTypeId === NONE ? null : subTypes.find((s) => s.id === subTypeId) ?? null),
    [subTypes, subTypeId],
  );

  const set = <K extends keyof AthleteInput>(k: K, v: AthleteInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    (async () => {
      try {
        const [s, types] = await Promise.all([
          listSports(),
          !athlete && canSubscribe ? listSubscriptionTypes() : Promise.resolve([]),
        ]);
        if (!active) return;
        setSports(s);
        setSubTypes(types);
      } catch (e) {
        toast({ title: t('athX.couldNotLoad'), description: describeError(e), variant: 'destructive' });
      }
    })();

    if (athlete) {
      setForm({
        first_name: athlete.first_name, last_name: athlete.last_name,
        email: athlete.email, phone: athlete.phone, date_of_birth: athlete.date_of_birth,
        gender: athlete.gender, address: athlete.address, sport_id: athlete.sport_id,
        rfid_uid: athlete.rfid_uid, photo_url: athlete.photo_url,
      });
      setPreview(athlete.photo_url);
    } else {
      setForm(blank());
      setPreview(null);
    }
    setPhotoFile(null);
    setNewSport('');
    setManageSports(false);
    setSportPendingDelete(null);
    setSubTypeId(NONE);
    setSubPaymentDate(today());
    setSubAmountPaid('');
    return () => { active = false; };
  }, [isOpen, athlete, canSubscribe]); // eslint-disable-line react-hooks/exhaustive-deps

  // Default the amount to the full price when a subscription type is chosen.
  useEffect(() => {
    if (selectedSub) setSubAmountPaid(String(selectedSub.price));
  }, [selectedSub]);

  const onPickPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPreview(URL.createObjectURL(file));
  };

  const addSport = async () => {
    const name = newSport.trim();
    if (!name) return;
    try {
      const s = await createSport(name);
      setSports((prev) => [...prev, s].sort((a, b) => a.name.localeCompare(b.name)));
      set('sport_id', s.id);
      setNewSport('');
    } catch (e) {
      toast({ title: t('sports.cannotAdd'), description: describeError(e), variant: 'destructive' });
    }
  };

  const removeSport = async (id: string) => {
    try {
      await deleteSport(id);
      setSports((prev) => prev.filter((s) => s.id !== id));
      if (form.sport_id === id) set('sport_id', null);
      setSportPendingDelete(null);
      toast({ title: t('sports.deleted') });
    } catch (e) {
      toast({ title: t('common.error'), description: describeError(e), variant: 'destructive' });
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.first_name.trim() || !form.last_name.trim()) {
      toast({ title: t('athX.nameRequired'), description: t('athX.nameRequiredDesc'), variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      let photoUrl = form.photo_url ?? null;
      if (photoFile) {
        photoUrl = await uploadImage('athlete-photos', photoFile);
      }
      const payload: AthleteInput = { ...form, photo_url: photoUrl };

      if (isEdit && athlete) {
        await updateAthlete(athlete.id, payload);
        toast({ title: t('athX.updated'), description: `${form.first_name} ${form.last_name}` });
      } else {
        const created = await createAthlete(payload);
        // Optionally assign the chosen subscription in the same flow.
        if (selectedSub) {
          try {
            await assignSubscription({
              athleteId: created.id,
              subscription: selectedSub,
              paymentDate: subPaymentDate,
              amountPaid: Number(subAmountPaid) || 0,
              creditUsed: 0,
              currentBalance: 0,
              currentTotalPaid: 0,
            });
            toast({ title: t('athX.added'), description: `${form.first_name} ${form.last_name} — ${selectedSub.name}` });
          } catch (subErr) {
            // The athlete is created; surface the subscription failure without losing them.
            toast({
              title: t('athX.added'),
              description: `${t('athX.couldNotSave')}: ${describeError(subErr)}`,
              variant: 'destructive',
            });
          }
        } else {
          toast({ title: t('athX.added'), description: `${form.first_name} ${form.last_name}` });
        }
      }
      onSaved();
      onClose();
    } catch (err) {
      toast({ title: t('athX.couldNotSave'), description: describeError(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const remaining = selectedSub ? Math.max(0, selectedSub.price - (Number(subAmountPaid) || 0)) : 0;

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-gym-gray border-gym-gold/25 text-gym-gold-light max-w-xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="gradient-text text-xl">
            {isEdit ? t('athX.editTitle') : t('athX.newTitle')}
          </DialogTitle>
          <DialogDescription className="text-gym-gold/60">
            {isEdit ? t('athX.editDesc') : t('athX.newDesc')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-5">
          {/* Photo */}
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="relative w-20 h-20 rounded-full bg-gym-gold/10 ring-2 ring-gym-gold/30 flex items-center justify-center overflow-hidden group shrink-0 transition-transform hover:scale-105"
            >
              {preview
                ? <img src={preview} alt="" className="w-full h-full object-cover" />
                : <User className="w-8 h-8 text-gym-gold/50" />}
              <span className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Camera className="w-5 h-5 text-white" />
              </span>
            </button>
            <div className="text-xs text-gym-gold/50">
              <p>{preview ? t('athX.photoChange') : t('athX.photoAdd')}</p>
            </div>
            <input ref={fileRef} type="file" accept="image/*" onChange={onPickPhoto} className="hidden" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('athX.firstName')} *</Label>
              <Input value={form.first_name} onChange={(e) => set('first_name', e.target.value)} className="gym-input" />
            </div>
            <div className="space-y-1.5">
              <Label>{t('athX.lastName')} *</Label>
              <Input value={form.last_name} onChange={(e) => set('last_name', e.target.value)} className="gym-input" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('athX.phone')}</Label>
              <Input value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} className="gym-input" />
            </div>
            <div className="space-y-1.5">
              <Label>{t('athX.email')}</Label>
              <Input type="email" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} className="gym-input" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('athX.dob')}</Label>
              <Input type="date" value={form.date_of_birth ?? ''}
                     onChange={(e) => set('date_of_birth', e.target.value || null)} className="gym-input" />
            </div>
            <div className="space-y-1.5">
              <Label>{t('athX.gender')}</Label>
              <Select value={form.gender ?? undefined} onValueChange={(v) => set('gender', v)}>
                <SelectTrigger className="gym-input"><SelectValue placeholder={t('athX.selectGender')} /></SelectTrigger>
                <SelectContent className="bg-gym-gray border-gym-gold/30 text-gym-gold-light">
                  <SelectItem value="male">{t('athX.male')}</SelectItem>
                  <SelectItem value="female">{t('athX.female')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Sport + management */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t('athX.sport')}</Label>
              <button type="button" onClick={() => setManageSports((v) => !v)}
                      className="inline-flex items-center gap-1 text-xs text-gym-gold/60 hover:text-gym-gold transition-colors">
                <Settings2 className="w-3.5 h-3.5" />{t('athX.manageSports')}
              </button>
            </div>
            <Select value={form.sport_id ?? undefined} onValueChange={(v) => set('sport_id', v)}>
              <SelectTrigger className="gym-input"><SelectValue placeholder={t('athX.selectSport')} /></SelectTrigger>
              <SelectContent className="bg-gym-gray border-gym-gold/30 text-gym-gold-light">
                {sports.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>

            <div className="flex gap-2">
              <Input value={newSport} onChange={(e) => setNewSport(e.target.value)}
                     placeholder={t('athX.newSportPlaceholder')} className="gym-input"
                     onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSport(); } }} />
              <Button type="button" variant="outline" onClick={addSport} disabled={!newSport.trim()}
                      className="border-gym-gold/40 text-gym-gold hover:bg-gym-gold/10 shrink-0">
                <Plus className="w-4 h-4" />
              </Button>
            </div>

            {/* Inline sport manager with per-row delete + inline confirm (no nested Radix dialog). */}
            {manageSports && (
              <div className="rounded-lg border border-gym-gold/20 divide-y divide-gym-gold/10 overflow-hidden animate-fade-in">
                {sports.length === 0 && (
                  <p className="p-3 text-xs text-gym-gold/50 text-center">{t('sports.empty')}</p>
                )}
                {sports.map((s) => (
                  <div key={s.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="truncate">{s.name}</span>
                    {sportPendingDelete === s.id ? (
                      <span className="flex items-center gap-1 text-xs">
                        <span className="text-gym-gold/60">{t('sports.deleteTitle')}</span>
                        <button type="button" onClick={() => removeSport(s.id)}
                                className="p-1 rounded text-red-400 hover:bg-red-500/15" aria-label="confirm">
                          <Check className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={() => setSportPendingDelete(null)}
                                className="p-1 rounded text-gym-gold/60 hover:bg-gym-gold/10" aria-label="cancel">
                          <X className="w-4 h-4" />
                        </button>
                      </span>
                    ) : (
                      <button type="button" onClick={() => setSportPendingDelete(s.id)}
                              className="p-1 rounded text-gym-gold/50 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                              aria-label="delete sport">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('athX.rfidCard')}</Label>
              <Input value={form.rfid_uid ?? ''} onChange={(e) => set('rfid_uid', e.target.value)}
                     className="gym-input font-mono" placeholder="A3F2C1D4" data-rfid-input="true" />
            </div>
            <div className="space-y-1.5">
              <Label>{t('athX.address')}</Label>
              <Input value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} className="gym-input" />
            </div>
          </div>

          {/* Inline subscription assignment (create mode only) */}
          {!isEdit && canSubscribe && (
            <div className="rounded-xl border border-gym-gold/25 bg-gym-black/40 p-4 space-y-3 animate-fade-in">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gym-gold/15 flex items-center justify-center text-gym-gold">
                  <CalendarCheck className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gym-gold">{t('athX.subSection')}</p>
                  <p className="text-[11px] text-gym-gold/50">{t('athX.subSectionDesc')}</p>
                </div>
              </div>

              <Select value={subTypeId} onValueChange={setSubTypeId}>
                <SelectTrigger className="gym-input"><SelectValue placeholder={t('athX.selectSubscription')} /></SelectTrigger>
                <SelectContent className="bg-gym-gray border-gym-gold/30 text-gym-gold-light">
                  <SelectItem value={NONE}>{t('athX.noSubscription')}</SelectItem>
                  {subTypes.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} — {formatDZD(s.price)}{s.duration > 0 ? ` · ${s.duration}${t('athX.days').charAt(0)}` : ` · ${t('athX.open')}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedSub && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>{t('athX.paymentDate')}</Label>
                      <Input type="date" value={subPaymentDate} onChange={(e) => setSubPaymentDate(e.target.value)} className="gym-input" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t('athX.amountPaid')}</Label>
                      <Input type="number" min="0" step="0.01" value={subAmountPaid}
                             onChange={(e) => setSubAmountPaid(e.target.value)} className="gym-input" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-gym-gold/10 px-3 py-2 text-sm">
                    <span className="flex items-center gap-1.5 text-gym-gold/70">
                      <CreditCard className="w-4 h-4" />{t('athX.remainingAfter')}
                    </span>
                    <span className="font-bold text-gym-gold">{formatDZD(remaining)}</span>
                  </div>
                </>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}
                    className="text-gym-gold/70 hover:text-gym-gold hover:bg-gym-gold/10">
              {t('athX.cancel')}
            </Button>
            <Button type="submit" className="gym-button" disabled={saving}>
              {saving ? t('athX.saving') : isEdit ? t('athX.save') : t('athX.addAthlete')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
