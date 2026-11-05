// Moteur du combat : fonctions pures, testables sans téléphone ni son (§3.3).
import type { Boss, BossVariant } from '../../content/schema';

export type Rng = () => number;

export type Stage =
  | 'build' // reconstruction avec les briques muettes
  | 'riposte' // question de sens, phrase masquée
  | 'verdict_ok'
  | 'verdict_error'
  | 'won'
  | 'lost'
  | 'abandoned';

export type ErrorKind = 'sequence' | 'riposte';

export interface BankBrick {
  key: string; // unique dans la banque, une brique répétée a plusieurs clés
  brickId: string;
}

export interface Round {
  rank: number;
  variant: BossVariant;
  bank: BankBrick[];
  riposteOrder: number[]; // ordre d'affichage des options
}

export interface RoundResult {
  rank: number;
  variant: BossVariant;
  placed: string[]; // identifiants de briques scellées
  riposteChoice: number | null; // indice dans variant.riposte.options
  replays: number;
  slowUsed: number;
  outcome: 'ok' | ErrorKind;
}

export interface AudioRequest {
  nonce: number; // change à chaque lecture demandée
  slow: boolean;
}

export interface BossState {
  rules: { allowedErrors: number; replaysPerRank: number };
  rounds: Round[];
  index: number;
  stage: Stage;
  errors: number;
  slowLeft: number;
  replaysUsed: number;
  slowUsedInRank: number;
  placed: string[]; // clés de la banque, dans l'ordre de placement
  sealed: string[]; // briques de la séquence scellée
  riposteChoice: number | null;
  lastError: ErrorKind | null;
  audio: AudioRequest;
  results: RoundResult[];
}

export type BossAction =
  | { type: 'PLACE'; key: string }
  | { type: 'REMOVE'; key: string }
  | { type: 'SEAL' }
  | { type: 'ANSWER'; option: number }
  | { type: 'REPLAY' }
  | { type: 'SLOW' }
  | { type: 'CONTINUE' }
  | { type: 'ABANDON' }
  | { type: 'RESUME'; round: Round };

export function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Tire une variante par rang : jamais celle du combat précédent, plus souvent celles aux éléments usés. */
export function drawBossVariants(
  boss: Boss,
  lastDrawn: readonly string[],
  retrievability: (elementId: string) => number,
  rng: Rng,
): BossVariant[] {
  return boss.ranks.map((rank) => {
    const pool = rank.variants.filter((v) => !lastDrawn.includes(v.id));
    const candidates = pool.length ? pool : rank.variants;
    return pickWeighted(candidates, retrievability, rng);
  });
}

function pickWeighted(candidates: BossVariant[], retrievability: (id: string) => number, rng: Rng): BossVariant {
  const weights = candidates.map((v) => {
    const mean = v.pivotElements.reduce((sum, el) => sum + retrievability(el), 0) / v.pivotElements.length;
    return 1 + 2 * (1 - mean);
  });
  let roll = rng() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < candidates.length; i++) {
    roll -= weights[i];
    if (roll < 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

export function buildRound(rank: number, variant: BossVariant, rng: Rng): Round {
  const bricks = [...variant.tokens, ...variant.distractors].map((brickId, i) => ({ key: `${i}:${brickId}`, brickId }));
  return {
    rank,
    variant,
    bank: shuffled(bricks, rng),
    riposteOrder: shuffled(
      (variant.riposte?.options ?? []).map((_, i) => i),
      rng,
    ),
  };
}

export function createBossState(boss: Boss, variants: BossVariant[], rng: Rng): BossState {
  return {
    rules: { allowedErrors: boss.allowedErrors, replaysPerRank: boss.replaysPerRank },
    rounds: variants.map((v, i) => buildRound(boss.ranks[i].order, v, rng)),
    index: 0,
    stage: 'build',
    errors: 0,
    slowLeft: boss.slowTokens,
    replaysUsed: 0,
    slowUsedInRank: 0,
    placed: [],
    sealed: [],
    riposteChoice: null,
    lastError: null,
    audio: { nonce: 1, slow: false },
    results: [],
  };
}

export const currentRound = (s: BossState) => s.rounds[s.index];
export const flamesLeft = (s: BossState) => Math.max(0, s.rules.allowedErrors - s.errors);
export const replaysLeft = (s: BossState) => s.rules.replaysPerRank - s.replaysUsed;
export const canHear = (s: BossState) => s.stage === 'build' || s.stage === 'riposte';
const isOver = (s: BossState) => s.stage === 'won' || s.stage === 'lost' || s.stage === 'abandoned';

function record(s: BossState, outcome: RoundResult['outcome']): RoundResult[] {
  const round = currentRound(s);
  return [
    ...s.results,
    {
      rank: round.rank,
      variant: round.variant,
      placed: s.sealed,
      riposteChoice: s.riposteChoice,
      replays: s.replaysUsed,
      slowUsed: s.slowUsedInRank,
      outcome,
    },
  ];
}

export function bossReducer(s: BossState, a: BossAction): BossState {
  if (isOver(s)) return s;
  const round = currentRound(s);

  switch (a.type) {
    case 'PLACE': {
      if (s.stage !== 'build' || s.placed.includes(a.key)) return s;
      if (!round.bank.some((b) => b.key === a.key)) return s;
      return { ...s, placed: [...s.placed, a.key] };
    }
    case 'REMOVE':
      if (s.stage !== 'build') return s;
      return { ...s, placed: s.placed.filter((k) => k !== a.key) };
    case 'SEAL': {
      if (s.stage !== 'build' || s.placed.length === 0) return s;
      const sealed = s.placed.map((key) => round.bank.find((b) => b.key === key)!.brickId);
      const exact = sealed.join(' ') === round.variant.tokens.join(' ');
      if (!exact) return fail({ ...s, sealed }, 'sequence');
      if (round.variant.riposte) return { ...s, sealed, stage: 'riposte' };
      return { ...s, sealed, stage: 'verdict_ok', results: record({ ...s, sealed }, 'ok') };
    }
    case 'ANSWER': {
      if (s.stage !== 'riposte') return s;
      const option = round.variant.riposte?.options[a.option];
      if (!option) return s;
      const next = { ...s, riposteChoice: a.option };
      if (!option.correct) return fail(next, 'riposte');
      return { ...next, stage: 'verdict_ok', results: record(next, 'ok') };
    }
    case 'REPLAY':
      if (!canHear(s) || replaysLeft(s) <= 0) return s;
      return { ...s, replaysUsed: s.replaysUsed + 1, audio: { nonce: s.audio.nonce + 1, slow: false } };
    case 'SLOW':
      if (!canHear(s) || s.slowLeft <= 0) return s;
      return {
        ...s,
        slowLeft: s.slowLeft - 1,
        slowUsedInRank: s.slowUsedInRank + 1,
        audio: { nonce: s.audio.nonce + 1, slow: true },
      };
    case 'CONTINUE': {
      if (s.stage !== 'verdict_ok' && s.stage !== 'verdict_error') return s;
      if (s.errors > s.rules.allowedErrors) return { ...s, stage: 'lost' };
      if (s.index === s.rounds.length - 1) return { ...s, stage: 'won' };
      return {
        ...s,
        index: s.index + 1,
        stage: 'build',
        replaysUsed: 0,
        slowUsedInRank: 0,
        placed: [],
        sealed: [],
        riposteChoice: null,
        lastError: null,
        audio: { nonce: s.audio.nonce + 1, slow: false },
      };
    }
    case 'ABANDON':
      return { ...s, stage: 'abandoned' };
    case 'RESUME': {
      // Reprise après interruption : même rang, phrase retirée au sort, écoutes remises à zéro.
      if (s.stage !== 'build' && s.stage !== 'riposte') return s;
      const rounds = s.rounds.map((r, i) => (i === s.index ? a.round : r));
      return {
        ...s,
        rounds,
        stage: 'build',
        replaysUsed: 0,
        slowUsedInRank: 0,
        placed: [],
        sealed: [],
        riposteChoice: null,
        audio: { nonce: s.audio.nonce + 1, slow: false },
      };
    }
  }
}

function fail(s: BossState, kind: ErrorKind): BossState {
  return { ...s, stage: 'verdict_error', errors: s.errors + 1, lastError: kind, results: record(s, kind) };
}

/** Résultat d'un rang, pour le débrief. */
export const variantIdsOf = (s: BossState) => s.rounds.map((r) => r.variant.id);
