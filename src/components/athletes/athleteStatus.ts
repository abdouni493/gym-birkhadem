import type { Athlete } from '@/lib/api/athletes';

const DAY = 86400000;

/** Whole days from today until an ISO date (negative = past). Null when there is no date. */
export const daysLeft = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  const t0 = new Date(); t0.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - t0.getTime()) / DAY);
};

export type AthleteState = 'active' | 'expiring' | 'expired' | 'none';

/** Expiring = 7 days or less left. */
export const athleteState = (a: Athlete): AthleteState => {
  const d = daysLeft(a.subscription_expiry);
  if (d === null) return a.subscription_status === 'active' ? 'active' : 'none';
  if (d < 0) return 'expired';
  if (d <= 7) return 'expiring';
  return 'active';
};

export const isActive = (a: Athlete) => {
  const s = athleteState(a);
  return s === 'active' || s === 'expiring';
};
