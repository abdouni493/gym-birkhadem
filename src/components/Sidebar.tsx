import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/lib/i18n';
import * as Icons from 'lucide-react';
import { ChevronLeft, ChevronRight, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { INTERFACES } from '@/lib/permissions';

/**
 * Resolve a lucide icon by the name stored in the permissions catalog.
 * Falls back to a circle so a typo in the catalog can never blank the sidebar.
 */
const iconFor = (name: string): React.ComponentType<{ className?: string }> => {
  const Icon = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name];
  return Icon ?? Icons.Circle;
};

/**
 * Sidebar entries come from the permission catalog, not a hardcoded list:
 * whatever the admin ticks in Workers -> Permissions is exactly what shows up
 * here. Admins see everything (PermissionSet.canView short-circuits).
 */
export const Sidebar: React.FC = () => {
  const { user, language, storeSettings, permissions } = useAuth();
  const { t } = useTranslation(language);
  const navigate = useNavigate();
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const gymName = storeSettings?.name || 'GYM';
  const logo = storeSettings?.logo_url;

  // Translate via i18n when a key exists, else fall back to the catalog label.
  const labelFor = (key: string, fallback: string) => {
    const map: Record<string, string> = {
      dashboard: 'common.dashboard',
      athletes: 'athletes.title',
      scanner: 'scanner.title',
      subscriptions: 'subscriptions.title',
      products: 'stock.title',
      purchase_invoices: 'purchases.title',
      pos: 'pos.title',
      invoices: 'sales.title',
      clients: 'clients.title',
      suppliers: 'suppliers.title',
      workers: 'workers.title',
      expenses: 'expenses.title',
      reports: 'reports.title',
      settings: 'settings.title',
      caisse: 'caisse.title',
      cards: 'cards.title',
    };
    const k = map[key];
    if (!k) return fallback;
    const translated = t(k);
    // useTranslation echoes the key back when it is missing.
    return translated === k ? fallback : translated;
  };

  const menuItems = permissions
    .visibleInterfaces()
    .filter((i) => i.path !== null);

  return (
    <div className={cn(
      'bg-gym-gradient border-r border-gym-gold/20 transition-all duration-300 flex flex-col',
      isCollapsed ? 'w-16' : 'w-64',
    )}>
      {/* Header */}
      <div className="p-4 border-b border-gym-gold/20">
        <div className="flex items-center justify-between">
          {!isCollapsed && (
            <div className="flex items-center space-x-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-gold-gradient flex items-center justify-center overflow-hidden shrink-0">
                {logo
                  ? <img src={logo} alt="logo" className="w-full h-full object-cover" />
                  : <span className="text-gym-black font-bold text-lg">{gymName.charAt(0).toUpperCase()}</span>}
              </div>
              <div className="min-w-0">
                <h1 className="text-lg font-bold gradient-text truncate">{gymName}</h1>
                <p className="text-xs text-gym-gold/60 capitalize">{user?.roleName}</p>
              </div>
            </div>
          )}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1 rounded-lg hover:bg-gym-gold/10 transition-colors shrink-0"
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? <ChevronRight className="w-5 h-5 text-gym-gold" /> : <ChevronLeft className="w-5 h-5 text-gym-gold" />}
          </button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {menuItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = iconFor(item.icon);
          const label = labelFor(item.key, item.label);
          return (
            <button
              key={item.key}
              onClick={() => item.path && navigate(item.path)}
              title={isCollapsed ? label : undefined}
              className={cn(
                'w-full flex items-center space-x-3 p-3 rounded-lg transition-all duration-300 hover:bg-gym-gold/10 group',
                isActive && 'bg-gym-gold/20 border border-gym-gold/30',
              )}
            >
              <Icon className={cn('w-5 h-5 transition-colors shrink-0', isActive ? 'text-gym-gold' : 'text-gym-gold/60 group-hover:text-gym-gold')} />
              {!isCollapsed && (
                <span className={cn('font-medium transition-colors text-sm', isActive ? 'text-gym-gold' : 'text-gym-gold/60 group-hover:text-gym-gold')}>
                  {label}
                </span>
              )}
            </button>
          );
        })}

        {menuItems.length === 0 && !isCollapsed && (
          <p className="text-xs text-gym-gold/40 p-3 leading-relaxed">
            No interfaces have been granted to your account yet. Ask an administrator
            to set your permissions.
          </p>
        )}
      </nav>

      {/* User Info */}
      {!isCollapsed && (
        <div className="p-4 border-t border-gym-gold/20">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gym-gold/20 rounded-full flex items-center justify-center overflow-hidden">
              {user?.photoUrl
                ? <img src={user.photoUrl} alt="" className="w-full h-full object-cover" />
                : <User className="w-5 h-5 text-gym-gold" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gym-gold truncate">{user?.firstName} {user?.lastName}</p>
              <p className="text-xs text-gym-gold/60 capitalize">{user?.roleName}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
