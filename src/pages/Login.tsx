
import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { LogIn, Mail, Lock, Eye, EyeOff, ShieldPlus } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { CreateAdminDialog } from '@/components/auth/CreateAdminDialog';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showCreateAdmin, setShowCreateAdmin] = useState(false);
  // null = still checking; the button only appears once we know no admin exists.
  const [adminExists, setAdminExists] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    supabase.rpc('admin_exists').then(({ data, error }) => {
      if (!active) return;
      // On error (e.g. schema not installed yet) show the button so setup is possible.
      setAdminExists(error ? false : data === true);
    });
    return () => { active = false; };
  }, []);
  const { login, isLoading, language, storeSettings } = useAuth();
  const { t } = useTranslation(language);
  const gymName = storeSettings?.name || 'GYM';
  const logo = storeSettings?.logo_url;
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password) {
      toast({
        title: t('common.error'),
        description: t('validation.required'),
        variant: "destructive",
      });
      return;
    }

    const result = await login(email, password);

    if (result.status === 'ok') {
      toast({
        title: t('login.welcomeBack'),
        description: t('common.success'),
      });
      navigate('/dashboard');
      return;
    }

    if (result.status === 'inactive') {
      toast({
        title: t('common.error'),
        description: 'This account is not linked to an active worker. Contact an administrator.',
        variant: "destructive",
      });
      return;
    }

    toast({
      title: t('common.error'),
      description: result.message || t('login.enterCredentials'),
      variant: "destructive",
    });
  };

  return (
    <div className="min-h-screen bg-gym-black flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gradient-to-br from-gym-black via-gym-gray to-gym-black"></div>
      
      {/* Background Elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gym-gold/5 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gym-gold/5 rounded-full blur-3xl"></div>
      </div>

      <Card className="w-full max-w-md gym-card relative z-10 animate-scale-in">
        <CardHeader className="space-y-1 text-center">
          <div className="mx-auto w-20 h-20 bg-gold-gradient rounded-full flex items-center justify-center mb-4 overflow-hidden">
            {logo ? <img src={logo} alt="logo" className="w-full h-full object-cover" /> : <span className="text-2xl font-bold text-gym-black">{gymName.charAt(0).toUpperCase()}</span>}
          </div>
          <CardTitle className="text-3xl gradient-text">{gymName}</CardTitle>
          <CardDescription className="text-gym-gold/60">
            {t('login.signIn')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t('common.email')}</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gym-gold/60 w-4 h-4" />
                <Input
                  id="email"
                  type="email"
                  placeholder={t('common.email')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 gym-input"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t('common.password')}</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gym-gold/60 w-4 h-4" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder={t('common.password')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10 gym-input"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gym-gold/60 hover:text-gym-gold"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <Button
              type="submit"
              className="w-full gym-button"
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-gym-black border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <>
                  <LogIn className="w-4 h-4 mr-2" />
                  {t('login.signInButton')}
                </>
              )}
            </Button>
          </form>

          {/*
            Only shown until the first administrator exists. bootstrap_admin
            also refuses at the database level once one exists.
          */}
          {adminExists === false && (
          <div className="mt-6 pt-6 border-t border-gym-gold/20 space-y-3">
            <p className="text-xs text-gym-gold/50 text-center leading-relaxed">
              Setting up for the first time? Create the administrator account.
            </p>
            <Button
              type="button"
              variant="outline"
              className="w-full border-gym-gold/40 text-gym-gold hover:bg-gym-gold/10"
              onClick={() => setShowCreateAdmin(true)}
            >
              <ShieldPlus className="w-4 h-4 mr-2" />
              Create admin account
            </Button>
          </div>
          )}
        </CardContent>
      </Card>

      <CreateAdminDialog
        isOpen={showCreateAdmin}
        onClose={() => setShowCreateAdmin(false)}
        onCreated={(createdEmail) => {
          // Prefill the email so the new admin can sign in right away.
          setEmail(createdEmail);
          setAdminExists(true);
        }}
      />
    </div>
  );
};
