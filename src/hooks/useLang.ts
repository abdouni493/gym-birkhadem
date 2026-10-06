import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { translator, makeTr, localeFor } from '@/lib/i18n';

/**
 * One hook for every translated screen:
 *   t('athX.save')              keyed string from src/lib/i18n.ts
 *   tr('Enregistrer', 'حفظ')    inline French / Arabic pair
 */
export const useLang = () => {
  const { language, setLanguage } = useAuth();
  return useMemo(() => ({
    language,
    setLanguage,
    isAr: language === 'ar',
    locale: localeFor(language),
    t: translator(language).t,
    tr: makeTr(language),
    /** Localised date (dd/mm/yyyy style) from an ISO date string. */
    fmtDate: (iso: string | null | undefined) =>
      iso ? new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString(localeFor(language)) : '—',
  }), [language, setLanguage]);
};
