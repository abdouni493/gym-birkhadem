
import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { GlobalRfidListener } from '@/components/GlobalRfidListener';
import { usePointerEventsGuard } from '@/hooks/usePointerEventsGuard';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { user } = useAuth();
  // Self-heals the "mouse blocked" bug: releases a pointer-events lock that a
  // Radix overlay leaked onto <body> when a render error tore it down.
  usePointerEventsGuard();

  if (!user) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-gym-black flex">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-6 overflow-auto">
          <div className="animate-fade-in">
            {children}
          </div>
        </main>
      </div>
      {/* Global RFID listener — captures card scans from any page */}
      <GlobalRfidListener />
    </div>
  );
};
