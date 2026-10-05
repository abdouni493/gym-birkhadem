/**
 * GlobalRfidListener
 * 
 * Captures RFID card scans from **any page** in the application.
 * 
 * How it works:
 * USB RFID readers emulate a keyboard — they type the card UID very quickly
 * and press Enter. This component listens for that pattern globally:
 *   1. Characters arriving < 50ms apart → buffer them
 *   2. Enter key → flush the buffer as a scanned UID
 *   3. Look up athlete by UID → check subscription → auto open/deny door
 * 
 * The component renders a floating overlay showing the access result.
 * It does NOT interfere with normal typing in input fields that have
 * the data-rfid-input attribute (those are the dedicated RFID fields
 * in AddAthlete / EditAthlete).
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Athlete, findAthleteByRfid, listAthleteSubscriptions, listSubscriptionTypes, recordSeance,
} from '@/lib/api/athletes';
import { useSerialPort } from '@/hooks/useSerialPort';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/lib/i18n';
import { ShieldCheck, ShieldX, ShieldAlert, X, User, Calendar, Wifi, Clock } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────
type SessionsInfo = {
  remaining: number;
  total: number;
  justUsed: boolean; // true if a session was deducted on this scan
};

type AccessResult = {
  type: 'granted' | 'denied' | 'warning' | 'unknown';
  athlete?: Athlete;
  message: string;
  subMessage?: string;
  daysLeft?: number;
  sessionsInfo?: SessionsInfo;
  uid: string;
};

// ── Component ──────────────────────────────────────────────────────────────────
export const GlobalRfidListener: React.FC = () => {
  // Door control removed: keep only scanning
  // (do not destructure sendViaOpenPort)
  useSerialPort();
  const { language } = useAuth();
  const { t } = useTranslation(language);
  const [result, setResult] = useState<AccessResult | null>(null);
  const [visible, setVisible] = useState(false);
  const [animating, setAnimating] = useState(false);

  // Buffer for keyboard-emulated RFID input
  const bufferRef = useRef('');
  const lastKeyTimeRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processingRef = useRef(false);

  // Auto-hide overlay after delay
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showResult = useCallback((res: AccessResult) => {
    // Clear any existing hide timer
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);

    setResult(res);
    setVisible(true);
    setAnimating(true);

    // Auto-hide after 5 seconds
    hideTimerRef.current = setTimeout(() => {
      setAnimating(false);
      setTimeout(() => setVisible(false), 400); // wait for exit animation
    }, 5000);
  }, []);

  const hideOverlay = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    setAnimating(false);
    setTimeout(() => setVisible(false), 400);
  }, []);

  // ── Process scanned UID ────────────────────────────────────────────────────
  const processUid = useCallback(async (rawUid: string) => {
    if (processingRef.current) return;
    processingRef.current = true;

    const uid = rawUid.toUpperCase().trim();
    if (!uid || uid.length < 4) {
      processingRef.current = false;
      return;
    }

    console.log('🔑 Global RFID scan detected:', uid);

    try {
      // Look up athlete by RFID UID
      const athlete = (await findAthleteByRfid(uid)) ?? undefined;

      if (!athlete) {
        showResult({
          type: 'unknown',
          uid,
          message: t('rfid.unknownCard'),
          subMessage: t('rfid.unknownDesc'),
        });
        processingRef.current = false;
        return;
      }

      // ── Check subscription ───────────────────────────────────────────
      const expiry = athlete.subscription_expiry;
      const today = new Date();

      if (!expiry) {
        showResult({
          type: 'denied',
          athlete,
          uid,
          message: t('rfid.noSubscription'),
          subMessage: `${athlete.full_name} ${t('rfid.noSubscriptionDesc')}`,
        });
        processingRef.current = false;
        return;
      }

      const expiryDate = new Date(expiry);
      const daysLeft = Math.ceil((expiryDate.getTime() - today.getTime()) / 86400000);

      if (daysLeft < 0) {
        showResult({
          type: 'denied',
          athlete,
          uid,
          message: t('rfid.expired'),
          subMessage: `${t('rfid.expiredOn')} ${expiryDate.toLocaleDateString(language === 'ar' ? 'ar' : language === 'fr' ? 'fr-FR' : 'en-US')}`,
          daysLeft: 0,
        });
        processingRef.current = false;
        return;
      }

      // ── Check session-based subscription ──────────────────────────────
      let sessionsInfo: SessionsInfo | undefined;

      const athleteSubs = await listAthleteSubscriptions(athlete.id);
      const subTypes = await listSubscriptionTypes();

      // Find latest subscription that has sessions (list is newest-first).
      let latestSubWithSessions: { id: string; sessions: number; name: string } | null = null;
      for (const sub of athleteSubs) {
        const subType = subTypes.find((s) => s.id === sub.subscription_id);
        if (subType && subType.sessions && subType.sessions > 0) {
          latestSubWithSessions = { id: sub.id, sessions: subType.sessions, name: subType.name };
          break;
        }
      }

      if (latestSubWithSessions) {
        // This is a session-based subscription — check remaining sessions
        const { data: historyData } = await supabase
          .from('seances_history')
          .select('seances_used, used_at')
          .eq('athlete_subscription_id', latestSubWithSessions.id);
        const history = (historyData ?? []) as { seances_used: number; used_at: string }[];

        const totalUsed = history.reduce((sum, h) => sum + (h.seances_used || 0), 0);
        const remaining = Math.max(0, (latestSubWithSessions.sessions || 0) - totalUsed);

        if (remaining <= 0) {
          // ── No sessions left → DENY ──────────────────────────────────
          showResult({
            type: 'denied',
            athlete,
            uid,
            message: t('rfid.noSessions'),
            subMessage: `${athlete.full_name} ${t('rfid.noSessionsDesc')}`,
            sessionsInfo: { remaining: 0, total: latestSubWithSessions.sessions, justUsed: false },
          });
          processingRef.current = false;
          return;
        }

        // ── Check if session was already used today ──────────────────────
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrowStart = new Date(today);
        tomorrowStart.setDate(today.getDate() + 1);

        const todaySession = history.find((h) => {
          const usedDate = new Date(h.used_at);
          usedDate.setHours(0, 0, 0, 0);
          return usedDate.getTime() === today.getTime();
        });

        if (todaySession) {
          // ── Already used today → DENY (but show friendly message) ──────
          showResult({
            type: 'warning',
            athlete,
            uid,
            message: t('rfid.alreadyToday'),
            subMessage: t('rfid.alreadyTodayDesc'),
            sessionsInfo: { remaining, total: latestSubWithSessions.sessions, justUsed: false },
          });
          
          // Courtesy access no longer opens the door in this build
          console.log('Courtesy access (door-opening disabled) for', athlete.first_name);
          
          processingRef.current = false;
          return;
        }

        // ── Deduct 1 session ───────────────────────────────────────────
        const newRemaining = remaining - 1;
        try {
          await recordSeance({
            athleteId: athlete.id,
            athleteSubscriptionId: latestSubWithSessions.id,
            seancesRemaining: newRemaining,
            notes: 'Auto-deducted by RFID scan',
          });
          console.log(`📉 Session deducted: ${newRemaining}/${latestSubWithSessions.sessions} remaining for ${athlete.first_name}`);
        } catch (err) {
          console.error('Failed to record session use:', err);
        }

        sessionsInfo = {
          remaining: newRemaining,
          total: latestSubWithSessions.sessions,
          justUsed: true,
        };

        // If this was the last session, still open door but warn
        if (newRemaining === 0) {
          // Door-opening removed: log only
          console.log('Last session reached (door-opening disabled) for', athlete.first_name);

          showResult({
            type: 'warning',
            athlete,
            uid,
            message: t('rfid.lastSession'),
            subMessage: t('rfid.lastSessionDesc'),
            sessionsInfo,
          });
          processingRef.current = false;
          return;
        }

        // ── Session still available → OPEN THE DOOR ────────────────────
        // Door-opening removed: log only
        console.log('Session-based access recorded (door-opening disabled) for', athlete.first_name);

        showResult({
          type: 'granted',
          athlete,
          uid,
          message: t('rfid.accessGranted'),
          subMessage: `${newRemaining}/${latestSubWithSessions.sessions} ${t('rfid.sessionsRemaining')}`,
          sessionsInfo,
        });
        processingRef.current = false;
        return;
      }

      // ── Active → OPEN THE DOOR ───────────────────────────────────────
      // Door-opening removed: log only
      console.log('Access granted (door-opening disabled) for', athlete.first_name);

      if (daysLeft <= 7 && !sessionsInfo) {
        showResult({
          type: 'warning',
          athlete,
          uid,
          message: t('rfid.accessGranted'),
          subMessage: `${t('rfid.expiringSoon')} — ${daysLeft} ${t('rfid.dayLeft')}`,
          daysLeft,
          sessionsInfo,
        });
      } else {
        showResult({
          type: 'granted',
          athlete,
          uid,
          message: t('rfid.accessGranted'),
          subMessage: sessionsInfo
            ? `${sessionsInfo.remaining}/${sessionsInfo.total} ${t('rfid.sessionsRemaining')}`
            : `${daysLeft} ${t('rfid.daysRemaining')}`,
          daysLeft: sessionsInfo ? undefined : daysLeft,
          sessionsInfo,
        });
      }
    } catch (err) {
      console.error('Global RFID processing error:', err);
      showResult({
        type: 'unknown',
        uid,
        message: t('rfid.error'),
        subMessage: t('rfid.errorDesc'),
      });
    } finally {
      processingRef.current = false;
    }
  }, [showResult, t, language]);

  // ── Global keydown listener ──────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const tagName = target?.tagName?.toLowerCase();

      // If user is in an input/textarea that has data-rfid-input, skip
      // (those are the dedicated RFID fields in Add/Edit Athlete)
      if (target?.getAttribute('data-rfid-input') === 'true') return;

      // If user is typing in a focused input/textarea/select, only capture
      // if the typing speed indicates RFID scanner (< 50ms between keys)
      const now = Date.now();
      const timeSinceLastKey = now - lastKeyTimeRef.current;

      if (e.key === 'Enter') {
        // Flush buffer
        const scanned = bufferRef.current.trim();
        bufferRef.current = '';
        lastKeyTimeRef.current = 0;
        if (timerRef.current) clearTimeout(timerRef.current);

        // Only process if the buffer looks like an RFID UID
        // (4+ hex chars accumulated very quickly)
        if (scanned.length >= 4 && /^[0-9A-Fa-f]+$/.test(scanned)) {
          // Prevent Enter from submitting forms
          e.preventDefault();
          e.stopPropagation();
          processUid(scanned);
        }
        return;
      }

      // Only buffer printable single characters
      if (e.key.length !== 1) return;

      // If user is in an input and typing slowly (> 80ms between keys),
      // this is normal typing — don't buffer
      const isInInput = tagName === 'input' || tagName === 'textarea' || tagName === 'select';
      if (isInInput && timeSinceLastKey > 80 && bufferRef.current.length > 0) {
        // Reset — this is human typing speed
        bufferRef.current = '';
      }

      if (isInInput && bufferRef.current.length === 0 && timeSinceLastKey > 80) {
        // First character in an input with slow typing — don't start buffering
        lastKeyTimeRef.current = now;
        return;
      }

      // Buffer the character (RFID readers type at < 30ms per char)
      if (bufferRef.current.length === 0 || timeSinceLastKey < 80) {
        bufferRef.current += e.key;
        lastKeyTimeRef.current = now;
      } else {
        // Too slow — reset buffer
        bufferRef.current = e.key;
        lastKeyTimeRef.current = now;
      }

      // Auto-clear buffer if no more chars come in 200ms
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        bufferRef.current = '';
      }, 200);
    };

    window.addEventListener('keydown', handleKeyDown, true); // capture phase
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [processUid]);

  // ── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  // ── Don't render if no result to show ────────────────────────────────────
  if (!visible) return null;

  // ── Color scheme based on result type ────────────────────────────────────
  const colors = {
    granted: {
      bg: 'from-green-900/95 to-green-950/95',
      border: 'border-green-500/50',
      icon: 'text-green-400',
      glow: 'shadow-[0_0_60px_rgba(34,197,94,0.3)]',
      ring: 'ring-green-500/30',
      accent: 'text-green-400',
      badge: 'bg-green-500/20 text-green-300 border-green-500/40',
    },
    warning: {
      bg: 'from-amber-900/95 to-amber-950/95',
      border: 'border-amber-500/50',
      icon: 'text-amber-400',
      glow: 'shadow-[0_0_60px_rgba(245,158,11,0.3)]',
      ring: 'ring-amber-500/30',
      accent: 'text-amber-400',
      badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    },
    denied: {
      bg: 'from-red-900/95 to-red-950/95',
      border: 'border-red-500/50',
      icon: 'text-red-400',
      glow: 'shadow-[0_0_60px_rgba(239,68,68,0.3)]',
      ring: 'ring-red-500/30',
      accent: 'text-red-400',
      badge: 'bg-red-500/20 text-red-300 border-red-500/40',
    },
    unknown: {
      bg: 'from-gray-900/95 to-gray-950/95',
      border: 'border-gray-500/50',
      icon: 'text-gray-400',
      glow: 'shadow-[0_0_60px_rgba(107,114,128,0.3)]',
      ring: 'ring-gray-500/30',
      accent: 'text-gray-400',
      badge: 'bg-gray-500/20 text-gray-300 border-gray-500/40',
    },
  };

  const c = colors[result?.type || 'unknown'];
  const Icon = result?.type === 'granted' ? ShieldCheck
    : result?.type === 'warning' ? ShieldAlert
    : result?.type === 'denied' ? ShieldX
    : ShieldX;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none transition-opacity duration-400 ${
        animating ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto"
        onClick={hideOverlay}
      />

      {/* Card */}
      <div
        className={`relative pointer-events-auto w-full max-w-md mx-4 rounded-2xl border-2 ${c.border} ${c.glow} ring-1 ${c.ring} bg-gradient-to-b ${c.bg} backdrop-blur-xl overflow-hidden transition-all duration-400 ${
          animating ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'
        }`}
      >
        {/* Close button */}
        <button
          onClick={hideOverlay}
          className="absolute top-3 right-3 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-colors z-10"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header with icon */}
        <div className="flex flex-col items-center pt-8 pb-4 px-6">
          <div className={`relative mb-4`}>
            {/* Pulsing glow ring */}
            {(result?.type === 'granted' || result?.type === 'warning') && (
              <>
                <span className={`absolute inset-0 rounded-full ${result.type === 'granted' ? 'bg-green-500/20' : 'bg-amber-500/20'} animate-ping`} style={{ width: '80px', height: '80px', top: '-10px', left: '-10px' }} />
              </>
            )}
            <div className={`relative w-16 h-16 rounded-full flex items-center justify-center ${
              result?.type === 'granted' ? 'bg-green-500/20 border-2 border-green-500/50' :
              result?.type === 'warning' ? 'bg-amber-500/20 border-2 border-amber-500/50' :
              result?.type === 'denied' ? 'bg-red-500/20 border-2 border-red-500/50' :
              'bg-gray-500/20 border-2 border-gray-500/50'
            }`}>
              <Icon className={`w-8 h-8 ${c.icon}`} />
            </div>
          </div>

          <h2 className={`text-2xl font-bold ${c.accent}`}>
            {result?.message}
          </h2>

          {/* Door-opening removed: show access granted/warning without door icon */}
        </div>

        {/* Athlete info */}
        {result?.athlete && (
          <div className="px-6 pb-4">
            <div className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/10">
              <div className="w-14 h-14 rounded-full bg-white/10 border border-white/20 flex items-center justify-center overflow-hidden flex-shrink-0">
                {(result.athlete as any).photo ? (
                  <img src={(result.athlete as any).photo} alt="photo" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-7 h-7 text-white/40" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-lg truncate">
                  {result.athlete.full_name}
                </p>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  {result.athlete.phone && (
                    <span className="text-white/50 text-xs">{result.athlete.phone}</span>
                  )}
                  {result.daysLeft !== undefined && (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${c.badge}`}>
                      <Calendar className="w-3 h-3" />
                      {result.daysLeft}{t('rfid.daysLeftShort')}
                    </span>
                  )}
                  {result.sessionsInfo && (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${c.badge}`}>
                      <Clock className="w-3 h-3" />
                      {result.sessionsInfo.remaining}/{result.sessionsInfo.total} {t('rfid.sessions')}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Sub message */}
        {result?.subMessage && (
          <div className="px-6 pb-6">
            <p className="text-center text-white/60 text-sm">{result.subMessage}</p>
          </div>
        )}

        {/* UID footer */}
        <div className="px-6 pb-4">
          <div className="flex items-center justify-center gap-2 text-white/30 text-xs">
            <Wifi className="w-3 h-3" />
            <span className="font-mono">{result?.uid}</span>
          </div>
        </div>

        {/* Bottom accent bar */}
        <div className={`h-1 w-full ${
          result?.type === 'granted' ? 'bg-gradient-to-r from-green-500/0 via-green-500 to-green-500/0' :
          result?.type === 'warning' ? 'bg-gradient-to-r from-amber-500/0 via-amber-500 to-amber-500/0' :
          result?.type === 'denied' ? 'bg-gradient-to-r from-red-500/0 via-red-500 to-red-500/0' :
          'bg-gradient-to-r from-gray-500/0 via-gray-500 to-gray-500/0'
        }`} />
      </div>
    </div>
  );
};
