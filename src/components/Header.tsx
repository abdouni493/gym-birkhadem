
import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/lib/i18n';
import { Bell, Search, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export const Header: React.FC = () => {
  const { user, logout, language } = useAuth();
  const { t } = useTranslation(language);

  return (
    <header className="bg-gym-gray border-b border-gym-gold/20 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4 flex-1">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gym-gold/60 w-4 h-4" />
            <Input
              placeholder={t('common.search') + ' ' + t('athletes.title') + ', ' + t('products.title') + '...'}
              className="pl-10 gym-input"
            />
          </div>
        </div>

        <div className="flex items-center space-x-4">
          {/* Notifications */}
          <button className="relative p-2 rounded-lg hover:bg-gym-gold/10 transition-colors">
            <Bell className="w-5 h-5 text-gym-gold/60" />
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full text-xs"></span>
          </button>

          {/* User Menu */}
          <div className="flex items-center space-x-3">
            <div className="text-right">
              <p className="text-sm font-medium text-gym-gold">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-xs text-gym-gold/60 capitalize">{user?.role}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={logout}
              className="hover:bg-red-500/20 hover:text-red-400"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
};
