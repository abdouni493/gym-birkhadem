import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import {
  Settings as SettingsIcon, Store, User, Save, Upload, Eye, EyeOff, Globe,
  Image as ImageIcon, Trash2, LogOut, MonitorSmartphone,
} from 'lucide-react';
import { ScanDisplaySettings } from '@/components/settings/ScanDisplaySettings';
import { toast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation, Language, tr } from '@/lib/i18n';
import { describeError } from '@/lib/supabase';
import { uploadImage } from '@/lib/storage';
import {
  StoreSettingsRow, getStoreSettings, saveStoreSettings, updateOwnProfile, updateOwnPassword,
} from '@/lib/api/misc';

const emptyStore: StoreSettingsRow = {
  id: 'store', name: '', description: '', email: '', phone: '', address: '',
  nif: '', nis: '', article: '', rc: '', logo_url: '', currency: 'DZD',
};

export const Settings: React.FC = () => {
  const navigate = useNavigate();
  const { language, setLanguage, user, refreshStore, logout } = useAuth();
  const { t } = useTranslation(language);

  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [store, setStore] = useState<StoreSettingsRow>(emptyStore);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [account, setAccount] = useState({ firstName: '', lastName: '', newPassword: '', confirmPassword: '' });

  useEffect(() => {
    (async () => {
      try {
        const s = await getStoreSettings();
        if (s) setStore({ ...emptyStore, ...s });
      } catch (e) {
        toast({ title: tr('Impossible de charger les paramètres', 'تعذر تحميل الإعدادات'), description: describeError(e), variant: 'destructive' });
      }
    })();
  }, []);

  useEffect(() => {
    setAccount((a) => ({ ...a, firstName: user?.firstName || '', lastName: user?.lastName || '' }));
  }, [user]);

  const onLogoPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    setStore((s) => ({ ...s, logo_url: URL.createObjectURL(file) }));
  };

  const saveStore = async () => {
    setBusy(true);
    try {
      let logoUrl = store.logo_url;
      // A blob: URL means an unsaved local preview — upload it for real.
      if (logoFile) logoUrl = await uploadImage('store-logos', logoFile);
      await saveStoreSettings({
        name: store.name, description: store.description, email: store.email,
        phone: store.phone, address: store.address, nif: store.nif, nis: store.nis,
        article: store.article, rc: store.rc, logo_url: logoUrl,
      });
      await refreshStore();
      setLogoFile(null);
      toast({ title: tr('Salle enregistrée', 'تم حفظ معلومات القاعة') });
    } catch (e) {
      toast({ title: tr('Impossible d’enregistrer la salle', 'تعذر حفظ معلومات القاعة'), description: describeError(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const saveAccount = async () => {
    if (!account.firstName.trim()) {
      toast({ title: tr('Prénom obligatoire', 'الاسم مطلوب'), variant: 'destructive' });
      return;
    }
    if (account.newPassword && account.newPassword !== account.confirmPassword) {
      toast({ title: tr('Les mots de passe ne correspondent pas', 'كلمتا المرور غير متطابقتين'), variant: 'destructive' });
      return;
    }
    if (account.newPassword && account.newPassword.length < 8) {
      toast({ title: tr('Mot de passe trop court', 'كلمة المرور قصيرة جدًا'), description: tr('Utilisez au moins 8 caractères.', 'استخدم 8 أحرف على الأقل.'), variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      await updateOwnProfile({ first_name: account.firstName, last_name: account.lastName });
      if (account.newPassword) await updateOwnPassword(account.newPassword);
      setAccount((a) => ({ ...a, newPassword: '', confirmPassword: '' }));
      toast({ title: tr('Compte mis à jour', 'تم تحديث الحساب'), description: tr('Reconnectez-vous si vous avez changé votre mot de passe.', 'أعد تسجيل الدخول إذا غيرت كلمة المرور.') });
    } catch (e) {
      toast({ title: tr('Impossible de mettre à jour le compte', 'تعذر تحديث الحساب'), description: describeError(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gym-black text-gym-gold p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold gradient-text">{tr('Paramètres', 'الإعدادات')}</h1>
            <p className="text-gym-gold/60 mt-1">{tr('Salle et compte.', 'القاعة والحساب.')}</p>
          </div>
          <SettingsIcon className="w-8 h-8 text-gym-gold" />
        </div>

        <Tabs defaultValue="store" className="w-full">
          <TabsList className="bg-gym-gray border border-gym-gold/20">
            <TabsTrigger value="store" className="data-[state=active]:bg-gym-gold data-[state=active]:text-gym-black text-gym-gold">
              <Store className="w-4 h-4 me-2" />{tr('Salle', 'القاعة')}
            </TabsTrigger>
            <TabsTrigger value="account" className="data-[state=active]:bg-gym-gold data-[state=active]:text-gym-black text-gym-gold">
              <User className="w-4 h-4 me-2" />{tr('Compte', 'الحساب')}
            </TabsTrigger>
            <TabsTrigger value="scan" className="data-[state=active]:bg-gym-gold data-[state=active]:text-gym-black text-gym-gold">
              <MonitorSmartphone className="w-4 h-4 me-2" />{t('scanSettings.tab')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="store" className="mt-4">
            <Card className="bg-gym-gray border-gym-gold/20">
              <CardHeader>
                <CardTitle className="text-gym-gold flex items-center gap-2"><Store className="w-5 h-5" />{tr('Informations de la salle', 'معلومات القاعة')}</CardTitle>
                <CardDescription className="text-gym-gold/60">{tr('Apparaît sur les factures.', 'يظهر في الفواتير.')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-24 h-24 rounded-lg bg-gym-black border border-gym-gold/30 flex items-center justify-center overflow-hidden">
                    {store.logo_url ? <img src={store.logo_url} alt="logo" className="w-full h-full object-contain" /> : <ImageIcon className="w-8 h-8 text-gym-gold/40" />}
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="cursor-pointer">
                      <span className="inline-flex items-center gym-button px-4 py-2 rounded-md"><Upload className="w-4 h-4 me-2" />{tr('Importer un logo', 'رفع الشعار')}</span>
                      <input type="file" accept="image/*" onChange={onLogoPick} className="hidden" />
                    </label>
                    {store.logo_url && (
                      <Button variant="ghost" onClick={() => { setStore((s) => ({ ...s, logo_url: '' })); setLogoFile(null); }}
                              className="text-red-400 hover:bg-red-500/10"><Trash2 className="w-4 h-4 me-2" />{tr('Retirer', 'إزالة')}</Button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div><Label>{tr('Nom', 'الاسم')}</Label><Input value={store.name ?? ''} onChange={(e) => setStore({ ...store, name: e.target.value })} className="gym-input mt-1" /></div>
                  <div><Label>{tr('Téléphone', 'الهاتف')}</Label><Input value={store.phone ?? ''} onChange={(e) => setStore({ ...store, phone: e.target.value })} className="gym-input mt-1" /></div>
                  <div><Label>{tr('E-mail', 'البريد الإلكتروني')}</Label><Input value={store.email ?? ''} onChange={(e) => setStore({ ...store, email: e.target.value })} className="gym-input mt-1" /></div>
                  <div><Label>{tr('Adresse', 'العنوان')}</Label><Input value={store.address ?? ''} onChange={(e) => setStore({ ...store, address: e.target.value })} className="gym-input mt-1" /></div>
                </div>
                <div><Label>{tr('Description', 'الوصف')}</Label><Textarea value={store.description ?? ''} onChange={(e) => setStore({ ...store, description: e.target.value })} className="gym-input mt-1" rows={2} /></div>

                <Separator className="bg-gym-gold/20" />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><Label>NIF</Label><Input value={store.nif ?? ''} onChange={(e) => setStore({ ...store, nif: e.target.value })} className="gym-input mt-1" /></div>
                  <div><Label>NIS</Label><Input value={store.nis ?? ''} onChange={(e) => setStore({ ...store, nis: e.target.value })} className="gym-input mt-1" /></div>
                  <div><Label>{tr('Article', 'المادة')}</Label><Input value={store.article ?? ''} onChange={(e) => setStore({ ...store, article: e.target.value })} className="gym-input mt-1" /></div>
                  <div><Label>RC</Label><Input value={store.rc ?? ''} onChange={(e) => setStore({ ...store, rc: e.target.value })} className="gym-input mt-1" /></div>
                </div>

                <Button onClick={saveStore} disabled={busy} className="gym-button"><Save className="w-4 h-4 me-2" />{busy ? tr('Enregistrement…', 'جارٍ الحفظ…') : tr('Enregistrer', 'حفظ')}</Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="account" className="mt-4 space-y-4">
            <Card className="bg-gym-gray border-gym-gold/20">
              <CardHeader>
                <CardTitle className="text-gym-gold flex items-center gap-2"><User className="w-5 h-5" />{tr('Mon compte', 'حسابي')}</CardTitle>
                <CardDescription className="text-gym-gold/60">{user?.email}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div><Label>{tr('Prénom', 'الاسم')}</Label><Input value={account.firstName} onChange={(e) => setAccount({ ...account, firstName: e.target.value })} className="gym-input mt-1" /></div>
                  <div><Label>{tr('Nom', 'اللقب')}</Label><Input value={account.lastName} onChange={(e) => setAccount({ ...account, lastName: e.target.value })} className="gym-input mt-1" /></div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>{tr('Nouveau mot de passe', 'كلمة مرور جديدة')}</Label>
                    <div className="relative mt-1">
                      <Input type={showPassword ? 'text' : 'password'} value={account.newPassword} onChange={(e) => setAccount({ ...account, newPassword: e.target.value })} className="gym-input pe-10" />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute end-3 top-1/2 -translate-y-1/2 text-gym-gold/60">{showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
                    </div>
                  </div>
                  <div><Label>{tr('Confirmer le mot de passe', 'تأكيد كلمة المرور')}</Label><Input type="password" value={account.confirmPassword} onChange={(e) => setAccount({ ...account, confirmPassword: e.target.value })} className="gym-input mt-1" /></div>
                </div>
                <Button onClick={saveAccount} disabled={busy} className="gym-button"><Save className="w-4 h-4 me-2" />{busy ? tr('Enregistrement…', 'جارٍ الحفظ…') : tr('Mettre à jour le compte', 'تحديث الحساب')}</Button>
              </CardContent>
            </Card>

            <Card className="bg-gym-gray border-gym-gold/20">
              <CardHeader>
                <CardTitle className="text-gym-gold flex items-center gap-2"><Globe className="w-5 h-5" />{tr('Langue', 'اللغة')}</CardTitle>
              </CardHeader>
              <CardContent>
                <Select value={language} onValueChange={(v) => setLanguage(v as Language)}>
                  <SelectTrigger className="gym-input"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-gym-gray border-gym-gold/30 text-gym-gold">
                    <SelectItem value="fr">Français</SelectItem>
                    <SelectItem value="ar">العربية</SelectItem>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            <Card className="bg-gym-gray border-red-500/20">
              <CardHeader><CardTitle className="text-red-400 flex items-center gap-2"><LogOut className="w-5 h-5" />{tr('Déconnexion', 'تسجيل الخروج')}</CardTitle></CardHeader>
              <CardContent>
                <Button onClick={async () => { await logout(); navigate('/login'); }} className="w-full bg-red-600 hover:bg-red-700">
                  <LogOut className="w-4 h-4 me-2" />{tr('Déconnexion', 'تسجيل الخروج')}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="scan" className="mt-4">
            <ScanDisplaySettings />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};
