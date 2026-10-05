/**
 * Spoken feedback after a card scan, using the recordings in /speech.
 *
 *   enter        → access granted
 *   not_enter    → access refused (unknown card, expired, no subscription, no sessions left)
 *   soon_expire  → access granted, but the subscription is about to run out
 *
 * Preferences are per device (localStorage), because the reception PC and a
 * display screen at the door may want different settings.
 */
import enterUrl from '../../speech/enter.mp3';
import notEnterUrl from '../../speech/not_enter.mp3';
import soonExpireUrl from '../../speech/soon_expire.mp3';

export type VoiceKey = 'enter' | 'not_enter' | 'soon_expire';

const SOURCES: Record<VoiceKey, string> = {
  enter: enterUrl,
  not_enter: notEnterUrl,
  soon_expire: soonExpireUrl,
};

export interface VoicePrefs {
  enabled: boolean;
  /** 0–1 */
  volume: number;
}

const PREFS_KEY = 'gymVoicePrefs';
const DEFAULT_PREFS: VoicePrefs = { enabled: true, volume: 1 };

export function getVoicePrefs(): VoicePrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

export function setVoicePrefs(prefs: Partial<VoicePrefs>): VoicePrefs {
  const next = { ...getVoicePrefs(), ...prefs };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — the change just won't persist */
  }
  return next;
}

// One preloaded element per clip, so playback starts instantly on scan.
const players = new Map<VoiceKey, HTMLAudioElement>();
let current: HTMLAudioElement | null = null;

function player(key: VoiceKey): HTMLAudioElement {
  let a = players.get(key);
  if (!a) {
    a = new Audio(SOURCES[key]);
    a.preload = 'auto';
    players.set(key, a);
  }
  return a;
}

/** Warm the audio cache so the first scan isn't delayed by a download. */
export function preloadVoices(): void {
  (Object.keys(SOURCES) as VoiceKey[]).forEach((k) => player(k).load());
}

/**
 * Play a clip. A new scan interrupts the previous message instead of queueing
 * behind it. `force` ignores the enabled flag (used by the "test" buttons).
 */
export function playVoice(key: VoiceKey, { force = false }: { force?: boolean } = {}): void {
  const prefs = getVoicePrefs();
  if (!prefs.enabled && !force) return;

  if (current) {
    current.pause();
    current.currentTime = 0;
  }
  const a = player(key);
  a.volume = Math.min(1, Math.max(0, prefs.volume));
  a.currentTime = 0;
  current = a;
  // Browsers block audio until the page has had one user interaction; a
  // keyboard-emulating RFID reader counts, so this only fails right after load.
  a.play().catch((e) => console.warn('Could not play scan voice:', e));
}
