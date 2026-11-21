import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { en, type I18nDictionary } from './en';
import { id } from './id';

export type Language = 'en' | 'id';

const STORAGE_KEY = 'stockmate_lang';

function getInitialLang(): Language {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'id' || saved === 'en') return saved;
  } catch {
    // Ignore storage access errors
  }
  return 'en';
}

interface I18nContextValue {
  lang: Language;
  setLang: (lang: Language) => void;
  t: I18nDictionary;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(getInitialLang);

  const setLang = (next: Language) => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ignore storage access errors
    }
  };

  const value = useMemo<I18nContextValue>(
    () => ({
      lang,
      setLang,
      t: lang === 'id' ? id : en,
    }),
    [lang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used inside I18nProvider');
  }
  return ctx;
}
