import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { tier } from '../content';
import { emptyProgress, refreshBossDoor, type ProgressSnapshot } from '../core/progress/progress';
import { createFsrsEngine } from '../core/srs/fsrsEngine';
import { newCard, reviewCard } from '../core/srs/memory';
import type { ReviewLogEntry, SrsEngine } from '../core/srs/types';
import { repository } from './repository';

const LEGACY_KEY = 'le-dechiffreur:progress:v1';

interface LegacyProgress {
  nodes?: ProgressSnapshot['nodes'];
  bricks?: ProgressSnapshot['bricks'];
  traps?: Record<string, number>;
  devUnlockAll?: boolean;
}

/**
 * Reprend la progression enregistrée avant la base SQLite. Sans historique, chaque élément acquis
 * reçoit une seule réussite, à sa date : la mémoire est sous-estimée, jamais surestimée.
 */
export async function migrateLegacy(engine: SrsEngine): Promise<void> {
  const raw = await AsyncStorage.getItem(LEGACY_KEY);
  if (!raw) return;
  const legacy: LegacyProgress = JSON.parse(raw);
  const empty = emptyProgress();
  // cards doit être un objet à part : sinon, comparé à empty, rien ne semble avoir changé et rien n'est enregistré.
  const next: ProgressSnapshot = { ...empty, nodes: legacy.nodes ?? {}, bricks: legacy.bricks ?? {}, cards: {}, devUnlockAll: !!legacy.devUnlockAll };
  const acquire = (id: string, at: number) => {
    next.cards[id] = reviewCard(newCard(id, engine, at), 'good', engine, at);
  };
  for (const [id, b] of Object.entries(next.bricks)) if (b.firstCorrectAt) acquire(id, b.firstCorrectAt);
  for (const [id, at] of Object.entries(legacy.traps ?? {})) acquire(id, at);
  const FORMULA_NODES: Record<string, string> = { 'n.1.05': 'f.be', 'n.1.09': 'f.not', 'n.1.12': 'f.q' };
  for (const [nodeId, formula] of Object.entries(FORMULA_NODES)) {
    const node = next.nodes[nodeId];
    if (node?.status === 'completed') acquire(formula, node.completedAt ?? Date.now());
  }
  await repository.saveChange(empty, next, []);
  await AsyncStorage.removeItem(LEGACY_KEY);
}

type Change = ProgressSnapshot | { next: ProgressSnapshot; logs: ReviewLogEntry[] };

interface ProgressValue {
  progress: ProgressSnapshot;
  engine: SrsEngine | null;
  loaded: boolean;
  error: string | null;
  /** L'heure du jeu. Le mode développeur peut l'avancer pour tester la mémoire. */
  now: () => number;
  /** Applique un changement et l'enregistre aussitôt : une session peut s'arrêter à tout moment. */
  commit: (change: (p: ProgressSnapshot) => Change) => void;
  resetAll: () => void;
}

const Context = createContext<ProgressValue | null>(null);

export function ProgressProvider({ children }: { children: ReactNode }) {
  const [progress, setProgress] = useState<ProgressSnapshot>(emptyProgress);
  const [engine, setEngine] = useState<SrsEngine | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(progress);

  useEffect(() => {
    (async () => {
      try {
        const scheduler = await createFsrsEngine();
        await migrateLegacy(scheduler);
        const p = await repository.load();
        latest.current = p;
        setProgress(p);
        setEngine(scheduler);
        setLoaded(true);
      } catch (e) {
        setError(String(e));
      }
    })();
  }, []);

  const commit = useCallback((change: (p: ProgressSnapshot) => Change) => {
    const prev = latest.current;
    const out = change(prev);
    const next = 'version' in out ? out : out.next;
    const logs = 'version' in out ? [] : out.logs;
    if (next === prev && !logs.length) return;
    latest.current = next;
    setProgress(next);
    repository.saveChange(prev, next, logs).catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (engine) commit((p) => refreshBossDoor(tier, p, engine, Date.now() + p.clockOffsetMs));
  }, [engine, commit, progress.clockOffsetMs]);

  const resetAll = useCallback(() => {
    latest.current = emptyProgress();
    setProgress(latest.current);
    repository.reset().catch((e) => setError(String(e)));
  }, []);

  const value = useMemo(
    () => ({ progress, engine, loaded, error, now: () => Date.now() + latest.current.clockOffsetMs, commit, resetAll }),
    [progress, engine, loaded, error, commit, resetAll],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useProgress() {
  const value = useContext(Context);
  if (!value) throw new Error('ProgressProvider manquant');
  return value;
}
