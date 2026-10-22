import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { de } from './de';
import { en } from './en';
import { pt } from './pt';

export const SUPPORTED_LANGUAGES = ['en', 'de', 'pt'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];
const STORAGE_KEY = 'mapmory-lang';

function detect(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && (SUPPORTED_LANGUAGES as readonly string[]).includes(saved)) return saved as Language;
  } catch {
    /* storage unavailable */
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language.slice(0, 2) : 'en';
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(nav) ? (nav as Language) : 'en';
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, de: { translation: de }, pt: { translation: pt } },
  lng: detect(),
  fallbackLng: 'en',
  supportedLngs: SUPPORTED_LANGUAGES,
  interpolation: { escapeValue: false }, // React escapes output
  returnNull: false,
});

const syncHtml = (lng: string) => {
  if (typeof document !== 'undefined') document.documentElement.lang = lng;
};
syncHtml(i18n.language);
i18n.on('languageChanged', (lng) => {
  syncHtml(lng);
  try {
    localStorage.setItem(STORAGE_KEY, lng);
  } catch {
    /* ignore */
  }
});

export default i18n;
