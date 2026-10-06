import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, usePermissions } from '@/contexts/AuthContext';
import { useLang } from '@/hooks/useLang';
import { Bell, LogOut, MonitorSmartphone, Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { launchCustomerDisplay } from '@/lib/customerDisplay';
import { cn } from '@/lib/utils';
import type { Language } from '@/lib/i18n';

const LANGS: { code: Language; label: string; short: string }[] = [
  { code: 'fr', label: 'Français', short: 'FR' },
  { code: 'ar', label: 'العربية', short: 'ع' },
];

export const Header: React.FC = () => {
  const { user, logout } = useAuth();
  const { canView } = usePermissions();
  const { t, tr, language, setLanguage, locale } = useLang();
  const navigate = useNavigate();

  return (
    <header className="bg-gym-gray border-b border-gym-gold/20 px-6 py-3">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-gym-gold/60 hidden md:block">
          {new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>

        <div className="flex items-center gap-3 ms-auto">
          {/* Language switcher */}
          <div className="flex items-center gap-1 rounded-xl border border-gym-gold/25 bg-gym-black/50 p-1" title={tr('Langue', 'اللغة')}>
            <Languages className="w-4 h-4 text-gym-gold/50 mx-1" />
            {LANGS.map((l) => (
              <button key={l.code} onClick={() => setLanguage(l.code)}
                      className={cn('px-3 py-1 rounded-lg text-sm font-semibold transition-all',
                        language === l.code ? 'bg-gym-gold text-gym-black shadow' : 'text-gym-gold/70 hover:bg-gym-gold/10')}
                      aria-pressed={language === l.code}>
                <span className="hidden sm:inline">{l.label}</span>
                <span className="sm:hidden">{l.short}</span>
              </button>
            ))}
          </div>

          {/* Customer display (second screen) */}
          <button onClick={() => launchCustomerDisplay(t)} title={t('display.open')}
                  className="p-2 rounded-lg hover:bg-gym-gold/10 transition-colors">
            <MonitorSmartphone className="w-5 h-5 text-gym-gold/60" />
          </button>

          {/* Alerts live on the dashboard */}
          {canView('dashboard') && (
            <button onClick={() => navigate('/dashboard')} title={tr('Alertes', 'التنبيهات')}
                    className="p-2 rounded-lg hover:bg-gym-gold/10 transition-colors">
              <Bell className="w-5 h-5 text-gym-gold/60" />
            </button>
          )}

          {/* User */}
          <div className="flex items-center gap-3">
            <div className="text-end">
              <p className="text-sm font-medium text-gym-gold">{user?.firstName} {user?.lastName}</p>
              <p className="text-xs text-gym-gold/60">{user?.roleName}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={logout} title={tr('Déconnexion', 'تسجيل الخروج')}
                    className="hover:bg-red-500/20 hover:text-red-400">
              <LogOut className="w-4 h-4 rtl:rotate-180" />
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
};
