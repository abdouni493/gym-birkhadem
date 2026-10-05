import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { ShieldOff } from 'lucide-react';

interface Props {
  /** Interface key from the permissions catalog. */
  interfaceKey: string;
  children: React.ReactNode;
}

/**
 * Route-level permission gate.
 *
 * Hiding a sidebar entry is not access control — without this, typing the URL
 * would still render the page. The database would refuse the queries, but the
 * user would see a broken screen full of errors instead of a clear refusal.
 *
 * This is defence in depth, not the enforcement itself: RLS is.
 */
export const RequirePermission: React.FC<Props> = ({ interfaceKey, children }) => {
  const { canView, isLoading, user, permissions } = useAuth();

  if (isLoading) return null;
  if (!user) return <Navigate to="/login" replace />;

  if (!canView(interfaceKey)) {
    // Send them somewhere useful rather than a dead end, unless the dashboard
    // is itself off-limits — then explain instead of bouncing in a loop.
    const fallback = permissions.visibleInterfaces().find((i) => i.path);

    if (fallback && fallback.key !== interfaceKey) {
      return <Navigate to={fallback.path as string} replace />;
    }

    return (
      <div className="min-h-screen bg-gym-black flex items-center justify-center p-6">
        <Card className="bg-gym-gray border-gym-gold/20 max-w-md">
          <CardContent className="p-8 text-center space-y-3">
            <ShieldOff className="w-10 h-10 text-gym-gold/30 mx-auto" />
            <h2 className="text-lg font-semibold text-gym-gold">No access</h2>
            <p className="text-sm text-gym-gold/60 leading-relaxed">
              Your account has not been granted access to any part of the app yet.
              Ask an administrator to set your permissions.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
};
