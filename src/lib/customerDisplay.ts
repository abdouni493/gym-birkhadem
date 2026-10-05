/**
 * Customer display: a second screen that shows the athlete who just scanned
 * their card (photo, name, days remaining…).
 *
 * Two transports, used together:
 *  - BroadcastChannel — the display runs on a second monitor of the SAME
 *    computer (opened with openCustomerDisplay()). Works offline, no setup.
 *  - Supabase Realtime (private broadcast channel) — the display runs on
 *    ANOTHER device (TV, tablet) logged in to the app at /display. Opt-in per
 *    sending computer, and needs the realtime.messages policies from
 *    supabase_schema.sql.
 *
 * Every scan carries a unique id, so a display that receives it through both
 * transports shows it once.
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { toast } from '@/hooks/use-toast';
import { VoiceKey, playVoice } from '@/lib/accessVoice';
import type { Athlete } from '@/lib/api/athletes';

export type ScanStatus = 'granted' | 'warning' | 'denied' | 'unknown';

export interface DisplayScan {
  id: string;
  at: number;
  status: ScanStatus;
  voice: VoiceKey;
  title: string;
  detail?: string;
  athlete?: {
    name: string;
    photoUrl: string | null;
    phone: string | null;
    sport: string | null;
  };
  daysLeft?: number | null;
  expiry?: string | null;
  sessions?: { remaining: number; total: number } | null;
}

/** Message the display window sends to its opener when a card is scanned while it has focus. */
export const FORWARDED_SCAN = 'gym-display-scan';

const TOPIC = 'gym-customer-display';
const REMOTE_PREF_KEY = 'gymRemoteDisplay';

// ── Preferences ───────────────────────────────────────────────────────────────

export function isRemoteDisplayEnabled(): boolean {
  try {
    return localStorage.getItem(REMOTE_PREF_KEY) === '1';
  } catch {
    return false;
  }
}

export function setRemoteDisplayEnabled(on: boolean): void {
  try {
    localStorage.setItem(REMOTE_PREF_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
  if (!on) closeRemote();
}

// ── Transports ────────────────────────────────────────────────────────────────

let local: BroadcastChannel | null = null;
function localChannel(): BroadcastChannel | null {
  if (!local && typeof BroadcastChannel !== 'undefined') local = new BroadcastChannel(TOPIC);
  return local;
}

let remote: RealtimeChannel | null = null;
let remoteReady: Promise<RealtimeChannel | null> | null = null;

function closeRemote() {
  if (remote) supabase.removeChannel(remote);
  remote = null;
  remoteReady = null;
}

/** Join the private realtime channel once; resolves null if it can't (e.g. policies missing). */
function remoteChannel(): Promise<RealtimeChannel | null> {
  if (remoteReady) return remoteReady;
  const ch = supabase.channel(TOPIC, { config: { private: true, broadcast: { self: false } } });
  remote = ch;
  remoteReady = new Promise((resolve) => {
    const timeout = setTimeout(() => fail('timed out'), 8000);
    function fail(why: string) {
      clearTimeout(timeout);
      console.warn(`Customer display (remote) unavailable: ${why}`);
      // Drop the channel so the next scan retries instead of reusing a dead one.
      if (remote === ch) closeRemote();
      resolve(null);
    }
    ch.subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timeout);
        resolve(ch);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        fail(err?.message ?? status);
      }
    });
  });
  return remoteReady;
}

/** Send a scan to every connected display. Never throws. */
export async function publishScan(scan: DisplayScan): Promise<void> {
  try {
    localChannel()?.postMessage(scan);
  } catch (e) {
    console.warn('Customer display (local) failed:', e);
  }
  if (!isRemoteDisplayEnabled()) return;
  const ch = await remoteChannel();
  if (!ch) return;
  try {
    await ch.send({ type: 'broadcast', event: 'scan', payload: scan });
  } catch (e) {
    console.warn('Customer display (remote) send failed:', e);
  }
}

/**
 * Listen for scans (used by the /display page). `source` tells the display
 * whether the scan came from this computer or over the network.
 */
export function subscribeScans(
  onScan: (scan: DisplayScan, source: 'local' | 'remote') => void,
): () => void {
  const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(TOPIC) : null;
  if (bc) bc.onmessage = (e) => onScan(e.data as DisplayScan, 'local');

  // The remote channel is refused until the realtime policies are installed;
  // rather than let it retry in a tight loop, drop it and try again later.
  let ch: RealtimeChannel | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  const join = () => {
    const c = supabase
      .channel(TOPIC, { config: { private: true } })
      .on('broadcast', { event: 'scan' }, ({ payload }) => onScan(payload as DisplayScan, 'remote'));
    ch = c;
    c.subscribe((status, err) => {
      if (stopped || ch !== c || (status !== 'CHANNEL_ERROR' && status !== 'TIMED_OUT')) return;
      console.warn('Customer display: remote channel unavailable, retrying in 60s', err ?? status);
      supabase.removeChannel(c);
      ch = null;
      retry = setTimeout(join, 60_000);
    });
  };
  join();

  return () => {
    stopped = true;
    bc?.close();
    if (retry) clearTimeout(retry);
    if (ch) supabase.removeChannel(ch);
  };
}

// ── Scan feedback ─────────────────────────────────────────────────────────────

export type ScanAnnouncement = Omit<DisplayScan, 'id' | 'at' | 'athlete' | 'expiry' | 'daysLeft'> & {
  athlete?: Athlete;
  /** Overrides the value computed from the athlete's subscription_expiry. */
  daysLeft?: number | null;
};

/**
 * Everything that should happen after a card scan besides the on-screen
 * result: play the voice message and update the customer display(s).
 */
export function announceScan({ athlete: a, daysLeft, ...rest }: ScanAnnouncement): void {
  playVoice(rest.voice);
  const expiry = a?.subscription_expiry ?? null;
  const days = daysLeft ?? (expiry ? Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000) : null);
  void publishScan({
    ...rest,
    id: crypto.randomUUID(),
    at: Date.now(),
    athlete: a ? { name: a.full_name, photoUrl: a.photo_url, phone: a.phone, sport: a.sports?.name ?? null } : undefined,
    expiry,
    daysLeft: days === null ? null : Math.max(0, days),
  });
}

// ── Opening the display on a second monitor ──────────────────────────────────

let displayWindow: Window | null = null;

export function isDisplayOpen(): boolean {
  return !!displayWindow && !displayWindow.closed;
}

interface ScreenInfo {
  availLeft: number;
  availTop: number;
  availWidth: number;
  availHeight: number;
}

/**
 * Open (or re-focus) the display window and move it onto the other monitor.
 *
 * The window is opened synchronously, before any await, so the click's user
 * activation is still valid and the popup isn't blocked. It is then moved with
 * the Window Management API (Chrome / Edge), which asks once for permission.
 */
export async function openCustomerDisplay(): Promise<'second-screen' | 'window' | 'blocked'> {
  if (!isDisplayOpen()) {
    displayWindow = window.open('/display', 'gym-customer-display', 'popup,width=1280,height=800');
  }
  const win = displayWindow;
  if (!win) return 'blocked';

  try {
    const getScreenDetails = (window as unknown as {
      getScreenDetails?: () => Promise<{ screens: ScreenInfo[]; currentScreen: ScreenInfo }>;
    }).getScreenDetails;
    if (getScreenDetails) {
      const details = await getScreenDetails.call(window);
      const other = details.screens.find((s) => s !== details.currentScreen);
      if (other) {
        win.moveTo(other.availLeft, other.availTop);
        win.resizeTo(other.availWidth, other.availHeight);
        return 'second-screen';
      }
    }
  } catch (e) {
    console.warn('Could not place the display on a second screen:', e);
  }
  win.focus();
  return 'window';
}

/** Open the display from a button click and tell the user where it ended up. */
export async function launchCustomerDisplay(t: (key: string) => string): Promise<void> {
  const where = await openCustomerDisplay();
  if (where === 'blocked') {
    toast({ title: t('display.open'), description: t('display.popupBlocked'), variant: 'destructive' });
  } else {
    toast({
      title: t('display.open'),
      description: t(where === 'second-screen' ? 'display.openedSecond' : 'display.openedWindow'),
    });
  }
}
