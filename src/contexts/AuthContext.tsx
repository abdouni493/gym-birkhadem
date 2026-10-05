import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Language } from '@/lib/i18n';
import { supabase, describeError } from '@/lib/supabase';
import { PermissionSet, PermissionRow, ActionKey } from '@/lib/permissions';

export type UserRole = 'admin' | 'worker';

export interface StoreSettings {
  id: string;
  name?: string;
  description?: string;
  email?: string;
  phone?: string;
  address?: string;
  nif?: string;
  nis?: string;
  article?: string;
  rc?: string;
  logo_url?: string;
  currency?: string;
}

export interface User {
  id: string;          // workers.id
  userId: string;      // auth.users.id
  email: string;
  role: UserRole;
  roleName: string;
  firstName: string;
  lastName: string;
  photoUrl?: string | null;
}

/**
 * Discriminated on a STRING, deliberately.
 * This project compiles with `strict: false`, and TypeScript will not narrow a
 * boolean discriminant (`ok: true | false`) when strictNullChecks is off — the
 * union stays un-narrowed and every branch access errors. A string tag narrows
 * correctly under either setting.
 */
export type LoginResult =
  | { status: 'ok'; user: User }
  | { status: 'invalid'; message?: string }
  | { status: 'inactive'; message?: string }
  | { status: 'error'; message?: string };

interface AuthContextType {
  user: User | null;
  session: Session | null;
  permissions: PermissionSet;
  /** Can this user see this interface in the sidebar? */
  canView: (interfaceKey: string) => boolean;
  /** Is this button action allowed? */
  can: (interfaceKey: string, action: ActionKey) => boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  isLoading: boolean;
  language: Language;
  setLanguage: (lang: Language) => void;
  storeSettings: StoreSettings | null;
  refreshStore: () => Promise<void>;
  refreshPermissions: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** Shape returned by the worker+role+permissions join below. */
interface WorkerProfileRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  status: string;
  photo_url: string | null;
  roles: { name: string; is_admin: boolean } | null;
}

const applyDirection = (lang: Language) => {
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.lang = lang;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<PermissionSet>(PermissionSet.empty());
  const [isLoading, setIsLoading] = useState(true);
  const [language, setLanguageState] = useState<Language>('en');
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);

  const refreshStore = useCallback(async () => {
    const { data, error } = await supabase
      .from('store_settings')
      .select('*')
      .eq('id', 'store')
      .maybeSingle();
    if (error) {
      console.error('Failed to load store settings:', describeError(error));
      return;
    }
    if (data) setStoreSettings(data as StoreSettings);
  }, []);

  /**
   * Resolve the signed-in auth user into a worker profile + permission set.
   * Returns null when the auth user has no active worker row — that account
   * can authenticate but has no place in the app, so we treat it as signed out.
   */
  const loadProfile = useCallback(async (authUserId: string): Promise<User | null> => {
    const { data: profile, error } = await supabase
      .from('workers')
      .select('id, first_name, last_name, email, status, photo_url, roles ( name, is_admin )')
      .eq('user_id', authUserId)
      .maybeSingle<WorkerProfileRow>();

    if (error) {
      console.error('Failed to load worker profile:', describeError(error));
      return null;
    }
    if (!profile || profile.status !== 'active') return null;

    const isAdmin = profile.roles?.is_admin === true;

    // Admins skip the permission fetch: is_admin() already short-circuits
    // every check, so the rows would be ignored anyway.
    let rows: PermissionRow[] = [];
    if (!isAdmin) {
      const { data: perms, error: permErr } = await supabase
        .from('worker_permissions')
        .select('interface_key, action_key')
        .eq('worker_id', profile.id);
      if (permErr) console.error('Failed to load permissions:', describeError(permErr));
      rows = (perms ?? []) as PermissionRow[];
    }

    setPermissions(new PermissionSet(rows, isAdmin));

    return {
      id: profile.id,
      userId: authUserId,
      email: profile.email ?? '',
      role: isAdmin ? 'admin' : 'worker',
      roleName: profile.roles?.name ?? 'Worker',
      firstName: profile.first_name,
      lastName: profile.last_name,
      photoUrl: profile.photo_url,
    };
  }, []);

  const refreshPermissions = useCallback(async () => {
    if (session?.user?.id) {
      const u = await loadProfile(session.user.id);
      setUser(u);
    }
  }, [session?.user?.id, loadProfile]);

  // Bootstrap: restore any existing session, then track auth changes.
  useEffect(() => {
    let active = true;

    const stored = localStorage.getItem('gymMonsterLanguage') as Language | null;
    const lang = stored && ['en', 'fr', 'ar'].includes(stored) ? stored : 'en';
    setLanguageState(lang);
    applyDirection(lang);

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;

      setSession(data.session);
      if (data.session?.user) {
        const u = await loadProfile(data.session.user.id);
        if (!active) return;
        setUser(u);
        // Authenticated but not an active worker: don't leave a half-signed-in
        // session lying around.
        if (!u) await supabase.auth.signOut();
      }
      await refreshStore();
      if (active) setIsLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!active) return;
      setSession(newSession);

      if (event === 'SIGNED_OUT' || !newSession?.user) {
        setUser(null);
        setPermissions(PermissionSet.empty());
        return;
      }
      // TOKEN_REFRESHED fires often; re-resolving the profile keeps role and
      // permission changes live without a page reload.
      const u = await loadProfile(newSession.user.id);
      if (active) setUser(u);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile, refreshStore]);

  const login = useCallback(
    async (email: string, password: string): Promise<LoginResult> => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });

        if (error) {
          return { status: 'invalid', message: error.message };
        }
        if (!data.user) {
          return { status: 'invalid' };
        }

        const u = await loadProfile(data.user.id);
        if (!u) {
          // Valid credentials, but no active worker row behind them.
          await supabase.auth.signOut();
          return { status: 'inactive' };
        }

        setUser(u);
        setSession(data.session);
        await refreshStore();
        return { status: 'ok', user: u };
      } catch (e) {
        return { status: 'error', message: describeError(e) };
      } finally {
        setIsLoading(false);
      }
    },
    [loadProfile, refreshStore],
  );

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setPermissions(PermissionSet.empty());
  }, []);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('gymMonsterLanguage', lang);
    applyDirection(lang);
  }, []);

  const canView = useCallback((k: string) => permissions.canView(k), [permissions]);
  const can = useCallback((k: string, a: ActionKey) => permissions.can(k, a), [permissions]);

  const value = useMemo(
    () => ({
      user,
      session,
      permissions,
      canView,
      can,
      login,
      logout,
      isLoading,
      language,
      setLanguage,
      storeSettings,
      refreshStore,
      refreshPermissions,
    }),
    [user, session, permissions, canView, can, login, logout, isLoading, language,
     setLanguage, storeSettings, refreshStore, refreshPermissions],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

/** Convenience hook for gating buttons: `const can = usePermissions();` */
export const usePermissions = () => {
  const { can, canView, permissions } = useAuth();
  return { can, canView, isAdmin: permissions.admin };
};
