import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { I18nDictionary } from './en';

export type Language = 'en' | 'id';

const STORAGE_KEY = 'stockmate_lang';

const dictionaryCache: Partial<Record<Language, I18nDictionary>> = {};

async function loadDictionary(lang: Language): Promise<I18nDictionary> {
  const cached = dictionaryCache[lang];
  if (cached) return cached;
  const loaded =
    lang === 'id' ? (await import('./id')).id : (await import('./en')).en;
  dictionaryCache[lang] = loaded;
  return loaded;
}

function getInitialLang(): Language {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'id' || saved === 'en') return saved;
  } catch {
    // Ignore storage access errors
  }
  try {
    const browserLang = window.navigator.language?.toLowerCase() ?? '';
    if (browserLang.startsWith('id')) return 'id';
  } catch {
    // Fallback below
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
  const [dict, setDict] = useState<I18nDictionary | null>(
    () => dictionaryCache[lang] ?? null,
  );

  useEffect(() => {
    let active = true;
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
    }
    void loadDictionary(lang).then((loaded) => {
      if (active) setDict(loaded);
    });
    return () => {
      active = false;
    };
  }, [lang]);

  const setLang = useCallback((next: Language) => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ignore storage access errors
    }
  }, []);

  const value = useMemo<I18nContextValue | null>(
    () => (dict ? { lang, setLang, t: dict } : null),
    [dict, lang, setLang],
  );

  if (!value) {
    return null;
  }

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used inside I18nProvider');
  }
  return ctx;
}
