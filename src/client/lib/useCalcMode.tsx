import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { PositionCalcMode } from '@/shared/domain';

const STORAGE_KEY = 'stockmate_calc_mode';

function getInitialCalcMode(): PositionCalcMode {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'BROKER_GROSS' || stored === 'NET_AFTER_FEES') {
      return stored;
    }
    return 'BROKER_GROSS';
  } catch {
    return 'BROKER_GROSS';
  }
}

interface CalcModeContextValue {
  calcMode: PositionCalcMode;
  isBrokerGross: boolean;
  setCalcMode: (mode: PositionCalcMode) => void;
}

const CalcModeContext = createContext<CalcModeContextValue | null>(null);

export function CalcModeProvider({ children }: { children: ReactNode }) {
  const [calcMode, setCalcModeState] = useState<PositionCalcMode>(getInitialCalcMode);

  const setCalcMode = (next: PositionCalcMode) => {
    setCalcModeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ignore storage errors
    }
  };

  const value = useMemo(
    () => ({
      calcMode,
      isBrokerGross: calcMode === 'BROKER_GROSS',
      setCalcMode,
    }),
    [calcMode],
  );

  return <CalcModeContext.Provider value={value}>{children}</CalcModeContext.Provider>;
}

export function useCalcMode(): CalcModeContextValue {
  const ctx = useContext(CalcModeContext);
  if (!ctx) {
    throw new Error('useCalcMode must be used inside CalcModeProvider');
  }
  return ctx;
}
