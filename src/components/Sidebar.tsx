import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import * as Icons from 'lucide-react';
import { ChevronLeft, ChevronRight, User, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLang } from '@/hooks/useLang';

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
interface SidebarProps {
  /** Mobile drawer state (ignored on desktop). */
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ mobileOpen, onMobileClose }) => {
  const { user, storeSettings, permissions } = useAuth();
  const { tr } = useLang();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsedPref, setIsCollapsed] = useState(false);
  // The mobile drawer always shows full labels.
  const isCollapsed = collapsedPref && !mobileOpen;

  const gymName = storeSettings?.name || 'GYM';
  const logo = storeSettings?.logo_url;

  const labelFor = (item: { label: string; labelAr: string }) => tr(item.label, item.labelAr);

  const menuItems = permissions
    .visibleInterfaces()
    .filter((i) => i.path !== null);

  return (
    <>
    {/* Mobile backdrop */}
    {mobileOpen && (
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden" onClick={onMobileClose} aria-hidden />
    )}
    <div className={cn(
      'bg-gym-gradient border-e border-gym-gold/20 transition-all duration-300 flex flex-col',
      // Mobile: off-canvas drawer, completely hidden when closed (no icon rail).
      'fixed inset-y-0 start-0 z-50 w-72 max-w-[85vw] md:static md:z-auto md:max-w-none md:h-auto',
      mobileOpen ? 'translate-x-0' : 'ltr:-translate-x-full rtl:translate-x-full md:!translate-x-0',
      isCollapsed ? 'md:w-16' : 'md:w-64',
    )}>
      {/* Header */}
      <div className="p-4 border-b border-gym-gold/20">
        <div className="flex items-center justify-between">
          {!isCollapsed && (
            <div className="flex items-center space-x-3 rtl:space-x-reverse min-w-0">
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
          <button onClick={onMobileClose} className="p-1 rounded-lg hover:bg-gym-gold/10 md:hidden shrink-0"
                  aria-label={tr('Fermer le menu', 'إغلاق القائمة')}>
            <X className="w-5 h-5 text-gym-gold" />
          </button>
          <button
            onClick={() => setIsCollapsed(!collapsedPref)}
            className="hidden md:block p-1 rounded-lg hover:bg-gym-gold/10 transition-colors shrink-0"
            aria-label={isCollapsed ? tr('Déplier le menu', 'توسيع القائمة') : tr('Replier le menu', 'طي القائمة')}
          >
            {isCollapsed ? <ChevronRight className="w-5 h-5 text-gym-gold rtl:rotate-180" /> : <ChevronLeft className="w-5 h-5 text-gym-gold rtl:rotate-180" />}
          </button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {menuItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = iconFor(item.icon);
          const label = labelFor(item);
          return (
            <button
              key={item.key}
              onClick={() => { if (item.path) navigate(item.path); onMobileClose(); }}
              title={isCollapsed ? label : undefined}
              className={cn(
                'w-full flex items-center space-x-3 rtl:space-x-reverse p-3 rounded-lg transition-all duration-300 hover:bg-gym-gold/10 group',
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
            {tr('Aucune interface n’a encore été attribuée à votre compte. Demandez à un administrateur de définir vos permissions.', 'لم يتم منح أي واجهة لحسابك بعد. اطلب من المسؤول تحديد صلاحياتك.')}
          </p>
        )}
      </nav>

      {/* User Info */}
      {!isCollapsed && (
        <div className="p-4 border-t border-gym-gold/20">
          <div className="flex items-center space-x-3 rtl:space-x-reverse">
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
    </>
  );
};
