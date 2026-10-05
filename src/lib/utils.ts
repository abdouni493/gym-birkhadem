import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Format amount as Algerian Dinar (DZD)
export function formatDZD(amount: number | string | null | undefined, locale = 'fr-DZ') {
  const value = Number(amount) || 0;
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: 'DZD' }).format(value);
  } catch (e) {
    return value.toFixed(2) + ' DZD';
  }
}

/** Where to go after signing in: the page that sent the user to /login (?next=), else the dashboard. */
export function nextPath(search: string): string {
  const next = new URLSearchParams(search).get('next');
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
}
