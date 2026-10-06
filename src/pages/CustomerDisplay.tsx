/**
 * Customer display (/display)
 *
 * Full-screen page for a second monitor (or a TV / tablet) facing the members.
 * Idle: gym branding, clock and a "scan your card" prompt.
 * After a scan: the athlete's photo, name, status and days remaining, then it
 * returns to idle on its own.
 *
 * Scans arrive from the reception window through src/lib/customerDisplay.ts;
 * this page never touches the database itself.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ShieldCheck, ShieldAlert, ShieldX, User, CalendarDays, Dumbbell, Ticket, Maximize, Minimize,
  Volume2, VolumeX, Nfc,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/lib/i18n';
import { DisplayScan, FORWARDED_SCAN, ScanStatus, subscribeScans } from '@/lib/customerDisplay';
import { playVoice, preloadVoices } from '@/lib/accessVoice';

const SHOW_MS = 9000;
const VOICE_PREF = 'gymDisplayVoice';

const STATUS_STYLE: Record<ScanStatus, {
  text: string; ring: string; glow: string; pill: string; bar: string; Icon: typeof ShieldCheck;
}> = {
  granted: {
    text: 'text-green-400', ring: 'ring-green-500/70', glow: 'shadow-[0_0_120px_rgba(34,197,94,0.35)]',
    pill: 'bg-green-500/15 text-green-300 border-green-500/40', bar: 'bg-green-500', Icon: ShieldCheck,
  },
  warning: {
    text: 'text-amber-400', ring: 'ring-amber-500/70', glow: 'shadow-[0_0_120px_rgba(245,158,11,0.35)]',
    pill: 'bg-amber-500/15 text-amber-300 border-amber-500/40', bar: 'bg-amber-500', Icon: ShieldAlert,
  },
  denied: {
    text: 'text-red-400', ring: 'ring-red-500/70', glow: 'shadow-[0_0_120px_rgba(239,68,68,0.35)]',
    pill: 'bg-red-500/15 text-red-300 border-red-500/40', bar: 'bg-red-500', Icon: ShieldX,
  },
  unknown: {
    text: 'text-gray-300', ring: 'ring-gray-500/60', glow: 'shadow-[0_0_120px_rgba(107,114,128,0.3)]',
    pill: 'bg-gray-500/15 text-gray-300 border-gray-500/40', bar: 'bg-gray-500', Icon: ShieldX,
  },
};

const LOCALE = { fr: 'fr-FR', ar: 'ar-DZ' } as const;

export const CustomerDisplay: React.FC = () => {
  const { language, storeSettings } = useAuth();
  const { t } = useTranslation(language);
  const locale = LOCALE[language] ?? 'fr-FR';

  const [scan, setScan] = useState<DisplayScan | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [voiceHere, setVoiceHere] = useState(() => {
    try { return localStorage.getItem(VOICE_PREF) === '1'; } catch { return false; }
  });

  const seenIds = useRef<string[]>([]);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceHereRef = useRef(voiceHere);
  voiceHereRef.current = voiceHere;

  // ── Receive scans ──────────────────────────────────────────────────────────
  const onScan = useCallback((s: DisplayScan, source: 'local' | 'remote') => {
    // The same scan can arrive over both transports — show it once.
    if (!s?.id || seenIds.current.includes(s.id)) return;
    seenIds.current = [...seenIds.current.slice(-19), s.id];

    setScan(s);
    // On the same computer the reception window already spoke; only a remote
    // device with its own speakers should repeat the message.
    if (source === 'remote' && voiceHereRef.current) playVoice(s.voice, { force: true });

    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setScan(null), SHOW_MS);
  }, []);

  useEffect(() => {
    preloadVoices();
    const unsubscribe = subscribeScans(onScan);
    return () => {
      unsubscribe();
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [onScan]);

  // ── Clock ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    document.title = `${storeSettings?.name || 'GYM'} — ${t('display.open')}`;
  }, [storeSettings?.name, t]);

  // ── Card scans typed into this window ─────────────────────────────────────
  // A keyboard-style RFID reader types into whichever window has focus. If
  // that's this one, hand the UID to the reception window that opened us.
  useEffect(() => {
    let buffer = '';
    let last = 0;
    const onKey = (e: KeyboardEvent) => {
      const time = Date.now();
      if (e.key === 'Enter') {
        const uid = buffer.trim();
        buffer = '';
        if (uid.length >= 4 && /^[0-9A-Fa-f]+$/.test(uid) && window.opener && !window.opener.closed) {
          window.opener.postMessage({ type: FORWARDED_SCAN, uid }, window.location.origin);
        }
        return;
      }
      if (e.key.length !== 1) return;
      buffer = time - last < 80 ? buffer + e.key : e.key;
      last = time;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── Fullscreen + auto-hiding controls ─────────────────────────────────────
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const show = () => {
      setControlsVisible(true);
      clearTimeout(timer);
      timer = setTimeout(() => setControlsVisible(false), 3000);
    };
    show();
    window.addEventListener('mousemove', show);
    return () => {
      window.removeEventListener('mousemove', show);
      clearTimeout(timer);
    };
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    else document.documentElement.requestFullscreen().catch(() => undefined);
  };

  const toggleVoice = () => {
    const next = !voiceHere;
    setVoiceHere(next);
    try { localStorage.setItem(VOICE_PREF, next ? '1' : '0'); } catch { /* ignore */ }
  };

  const gymName = storeSettings?.name || 'GYM';
  const logo = storeSettings?.logo_url;

  return (
    <div
      dir={language === 'ar' ? 'rtl' : 'ltr'}
      onDoubleClick={toggleFullscreen}
      className={`relative h-screen w-screen overflow-hidden bg-gym-black text-gym-gold-light select-none ${
        controlsVisible ? '' : 'cursor-none'
      }`}
    >
      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(212,175,55,0.12),transparent_60%)]" />

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-[4vw] pt-[3vh]">
        <div className="flex items-center gap-4 min-w-0">
          {logo ? (
            <img src={logo} alt="" className="h-[7vh] w-[7vh] rounded-2xl object-contain bg-white/5 p-1" />
          ) : (
            <div className="h-[7vh] w-[7vh] rounded-2xl bg-gold-gradient flex items-center justify-center">
              <Dumbbell className="h-1/2 w-1/2 text-gym-black" />
            </div>
          )}
          <h1 className="truncate text-[3.2vh] font-bold gradient-text">{gymName}</h1>
        </div>
        <div className="text-end">
          <p className="text-[4.5vh] font-bold leading-none tabular-nums text-gym-gold">
            {now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
          </p>
          <p className="mt-1 text-[1.8vh] text-gym-gold/60 capitalize">
            {now.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
      </header>

      {/* Main */}
      <main className="relative z-10 flex h-[calc(100vh-14vh)] items-center justify-center px-[4vw] pb-[4vh]">
        {scan ? <ScanView key={scan.id} scan={scan} t={t} locale={locale} /> : <IdleView t={t} />}
      </main>

      {/* Controls (appear on mouse move) */}
      <div
        className={`absolute bottom-4 end-4 z-20 flex gap-2 transition-opacity duration-300 ${
          controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={toggleVoice}
          className="flex items-center gap-2 rounded-full border border-gym-gold/30 bg-gym-gray/80 px-4 py-2 text-sm text-gym-gold hover:bg-gym-gold/10"
        >
          {voiceHere ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          {t('display.voiceHere')}
        </button>
        <button
          onClick={toggleFullscreen}
          className="flex items-center gap-2 rounded-full border border-gym-gold/30 bg-gym-gray/80 px-4 py-2 text-sm text-gym-gold hover:bg-gym-gold/10"
        >
          {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          {t('display.fullscreen')}
        </button>
      </div>
    </div>
  );
};

// ── Idle ──────────────────────────────────────────────────────────────────────
const IdleView: React.FC<{ t: (k: string) => string }> = ({ t }) => (
  <div className="flex flex-col items-center text-center animate-fade-in">
    <div className="relative mb-[5vh] flex h-[26vh] w-[26vh] items-center justify-center">
      <span className="absolute inset-0 rounded-full border-2 border-gym-gold/30 animate-ping [animation-duration:2.5s]" />
      <span className="absolute inset-[12%] rounded-full border border-gym-gold/20" />
      <div className="relative flex h-[60%] w-[60%] items-center justify-center rounded-full bg-gym-gold/10 ring-2 ring-gym-gold/40">
        <Nfc className="h-1/2 w-1/2 text-gym-gold" />
      </div>
    </div>
    <h2 className="text-[7vh] font-extrabold leading-tight gradient-text">{t('display.scanCard')}</h2>
    <p className="mt-[1.5vh] text-[2.6vh] text-gym-gold/60">{t('display.scanHint')}</p>
  </div>
);

// ── Scan result ───────────────────────────────────────────────────────────────
const ScanView: React.FC<{ scan: DisplayScan; t: (k: string) => string; locale: string }> = ({ scan, t, locale }) => {
  const st = STATUS_STYLE[scan.status] ?? STATUS_STYLE.unknown;
  const a = scan.athlete;
  const days = scan.daysLeft;
  const expiry = scan.expiry
    ? new Date(scan.expiry).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  return (
    <div className="w-full max-w-[1500px] animate-scale-in">
      <div className="flex flex-col items-center gap-[4vh] lg:flex-row lg:items-center lg:gap-[5vw]">
        {/* Photo */}
        <div
          className={`relative shrink-0 h-[34vh] w-[34vh] lg:h-[52vh] lg:w-[52vh] rounded-[3vh] overflow-hidden bg-gym-gray ring-[0.8vh] ${st.ring} ${st.glow}`}
        >
          {a?.photoUrl ? (
            <img src={a.photoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <User className="h-1/2 w-1/2 text-gym-gold/25" />
            </div>
          )}
        </div>

        {/* Details */}
        <div className="flex min-w-0 flex-1 flex-col items-center text-center lg:items-start lg:text-start">
          <span className={`inline-flex items-center gap-3 rounded-full border px-[2vh] py-[0.8vh] text-[2.8vh] font-bold ${st.pill}`}>
            <st.Icon className="h-[3.2vh] w-[3.2vh]" />
            {scan.title}
          </span>

          <h2 className="mt-[2.5vh] max-w-full break-words text-[7.5vh] font-extrabold leading-[1.05] text-white">
            {a?.name ?? '—'}
          </h2>

          {a?.sport && (
            <p className="mt-[1.2vh] flex items-center gap-2 text-[2.6vh] text-gym-gold/70">
              <Dumbbell className="h-[2.6vh] w-[2.6vh]" />{a.sport}
            </p>
          )}

          {a && (
            <div className="mt-[4vh] flex flex-wrap justify-center gap-[2vh] lg:justify-start">
              {/* Days remaining */}
              <div className="min-w-[24vh] rounded-[2.5vh] border border-white/10 bg-white/[0.04] px-[3vh] py-[2.2vh]">
                {days !== null && days !== undefined ? (
                  <>
                    <p className={`text-[11vh] font-black leading-none tabular-nums ${st.text}`}>{days}</p>
                    <p className="mt-[1vh] text-[2.4vh] font-medium text-gym-gold-light/80">
                      {days === 1 ? t('display.dayRemaining') : t('display.daysRemaining')}
                    </p>
                  </>
                ) : (
                  <p className="py-[3vh] text-[2.6vh] font-semibold text-red-300">{t('display.noSubscription')}</p>
                )}
              </div>

              {/* Sessions */}
              {scan.sessions && (
                <div className="min-w-[24vh] rounded-[2.5vh] border border-white/10 bg-white/[0.04] px-[3vh] py-[2.2vh]">
                  <p className={`text-[11vh] font-black leading-none tabular-nums ${st.text}`}>
                    {scan.sessions.remaining}
                    <span className="text-[4.5vh] text-gym-gold-light/40">/{scan.sessions.total}</span>
                  </p>
                  <p className="mt-[1vh] flex items-center gap-2 text-[2.4vh] font-medium text-gym-gold-light/80">
                    <Ticket className="h-[2.4vh] w-[2.4vh]" />{t('display.sessionsLeft')}
                  </p>
                </div>
              )}
            </div>
          )}

          {expiry && (
            <p className="mt-[3vh] flex items-center gap-2 text-[2.6vh] text-gym-gold-light/70">
              <CalendarDays className="h-[2.6vh] w-[2.6vh]" />
              {t('display.expiresOn')} <span className="font-semibold text-gym-gold-light">{expiry}</span>
            </p>
          )}

          {scan.detail && (
            <p className="mt-[1.5vh] max-w-[60ch] text-[2.4vh] text-white/55">{scan.detail}</p>
          )}
        </div>
      </div>

      {/* Time left on screen */}
      <div className="mx-auto mt-[5vh] h-[0.6vh] w-full max-w-[1500px] overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full ${st.bar} origin-left rtl:origin-right`}
          style={{ animation: `display-countdown ${SHOW_MS}ms linear forwards` }}
        />
      </div>
      <style>{'@keyframes display-countdown { from { transform: scaleX(1); } to { transform: scaleX(0); } }'}</style>
    </div>
  );
};
