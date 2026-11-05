import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { BossState } from '../core/boss/engine';

export interface TestSettings {
  showMeanings: boolean; // test sans leçons : le sens s'affiche sous les briques
  muted: boolean; // test à l'oreille coupée (Porte 1)
  haptics: boolean;
}

interface BossSessionValue {
  settings: TestSettings;
  setSettings: (next: TestSettings) => void;
  lastCombat: BossState | null;
  setLastCombat: (s: BossState | null) => void;
  lastBlamed: string[];
  setLastBlamed: (ids: string[]) => void;
}

/** Lu depuis la base à l'ouverture de l'Antichambre, pour les écrans du combat. */
export const bossMemory = {
  lastDrawn: [] as string[],
  hasEntered: false,
  defeatsInARow: 0,
  resume: null as { attemptId: string; state: BossState } | null,
};

const Context = createContext<BossSessionValue | null>(null);

export function BossSessionProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<TestSettings>({ showMeanings: false, muted: false, haptics: true });
  const [lastCombat, setLastCombat] = useState<BossState | null>(null);
  const [lastBlamed, setLastBlamed] = useState<string[]>([]);
  const value = useMemo(
    () => ({ settings, setSettings, lastCombat, setLastCombat, lastBlamed, setLastBlamed }),
    [settings, lastCombat, lastBlamed],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useBossSession() {
  const value = useContext(Context);
  if (!value) throw new Error('BossSessionProvider manquant');
  return value;
}
