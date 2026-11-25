import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'stockmate_hide_balances';

function getInitialHidden(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

interface PrivacyContextValue {
  hideBalances: boolean;
  toggleHideBalances: () => void;
}

const PrivacyContext = createContext<PrivacyContextValue | null>(null);

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [hideBalances, setHideBalances] = useState<boolean>(getInitialHidden);

  const toggleHideBalances = () => {
    setHideBalances((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  };

  const value = useMemo(
    () => ({ hideBalances, toggleHideBalances }),
    [hideBalances],
  );

  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>;
}

export function usePrivacy(): PrivacyContextValue {
  const ctx = useContext(PrivacyContext);
  if (!ctx) {
    throw new Error('usePrivacy must be used inside PrivacyProvider');
  }
  return ctx;
}

export const MASKED_IDR = 'Rp •••••••';
export const MASKED_LOTS = '•••';
