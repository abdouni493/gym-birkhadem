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
