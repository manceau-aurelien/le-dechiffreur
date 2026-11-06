// Règles de mémoire du §3.4 : notation, bride débutant, usure, socle, verrous.
import type { CheckResult } from '../exercise/types';
import type { ElementType, Rating, SrsCard, SrsEngine } from './types';

const DAY_MS = 86_400_000;

export const SOCLE_FOR_NEW_NODE = 0.7;
export const SOCLE_FOR_BOSS = 0.8;
const SOCLE_R = 0.7;
const DUE_R = 0.9;
const LISTEN_RATIO_MIN = 0.7;
const LISTEN_MIN_ATTEMPTS = 3;

/** Écoutes comprises : 3 écoutes ou plus font d'une bonne réponse une réponse « difficile ». */
const HARD_AFTER_REPLAYS = 2;

export const elementTypeOf = (id: string): ElementType => (id.startsWith('b.') ? 'brick' : id.startsWith('f.') ? 'formula' : 'trap');

/** Jour calendaire local, pour compter les jours de réussite distincts. */
export function dayKey(now: number): number {
  return Math.floor((now - new Date(now).getTimezoneOffset() * 60_000) / DAY_MS);
}

export function ratingFor(result: Pick<CheckResult, 'correct' | 'almost'>, replays: number, listening: boolean): Rating {
  if (!result.correct) return 'again';
  if (result.almost) return 'hard';
  if (listening && replays >= HARD_AFTER_REPLAYS) return 'hard';
  return 'good';
}

/** Bride débutant : 1re révision à 1 jour au plus, 2e à 3 jours au plus (§3.4). */
export function capDue(dueAt: number, reps: number, now: number): number {
  if (reps === 1) return Math.min(dueAt, now + DAY_MS);
  if (reps === 2) return Math.min(dueAt, now + 3 * DAY_MS);
  return dueAt;
}

export interface ReviewOptions {
  listening?: boolean;
  fromBoss?: boolean;
  exerciseRef?: string;
}

export function newCard(elementId: string, engine: SrsEngine, now: number): SrsCard {
  return {
    elementId,
    elementType: elementTypeOf(elementId),
    state: engine.createState(elementId, now),
    stability: 0,
    difficulty: 0,
    dueAt: now,
    reps: 0,
    lapses: 0,
    lastReviewAt: now,
    distinctSuccessDays: 0,
    lastSuccessDay: null,
    listenOk: 0,
    listenTotal: 0,
    lastWrong: false,
    lastFromBoss: false,
    recentRefs: [],
  };
}

export function reviewCard(card: SrsCard, rating: Rating, engine: SrsEngine, now: number, options: ReviewOptions = {}): SrsCard {
  const reviewed = engine.review(card.state, rating, now);
  const today = dayKey(now);
  const success = rating !== 'again';
  const isNewDay = success && card.lastSuccessDay !== today;
  return {
    ...card,
    ...reviewed,
    dueAt: capDue(reviewed.dueAt, reviewed.reps, now),
    lastReviewAt: now,
    distinctSuccessDays: card.distinctSuccessDays + (isNewDay ? 1 : 0),
    lastSuccessDay: success ? today : card.lastSuccessDay,
    listenOk: card.listenOk + (options.listening && success ? 1 : 0),
    listenTotal: card.listenTotal + (options.listening ? 1 : 0),
    lastWrong: !success,
    lastFromBoss: !success && !!options.fromBoss,
    recentRefs: options.exerciseRef ? [options.exerciseRef, ...card.recentRefs].slice(0, 3) : card.recentRefs,
  };
}

export type Wear = 'neuve' | 'patinee' | 'fissuree' | 'effritee';

export function wearOf(r: number): Wear {
  if (r >= 0.9) return 'neuve';
  if (r >= 0.8) return 'patinee';
  if (r >= 0.6) return 'fissuree';
  return 'effritee';
}

export const WEAR_LABEL: Record<Wear, string> = { neuve: 'neuves', patinee: 'patinées', fissuree: 'fissurées', effritee: 'effritées' };

export function wearCounts(cards: SrsCard[], engine: SrsEngine, now: number): Record<Wear, number> {
  const counts: Record<Wear, number> = { neuve: 0, patinee: 0, fissuree: 0, effritee: 0 };
  for (const c of cards) counts[wearOf(engine.retrievability(c.state, now))]++;
  return counts;
}

/** Une carte est due si R < 0,90, ou si son échéance bridée est atteinte. */
export function isDue(card: SrsCard, r: number, now: number): boolean {
  return r < DUE_R || now >= card.dueAt;
}

export function priorityOf(card: SrsCard, r: number): number {
  return (1 - r) * (card.lastWrong || card.lastFromBoss ? 1.5 : 1);
}

/** Part des éléments acquis dont la mémoire estimée est ≥ 70 %. 100 % s'il n'y en a aucun. */
export function computeSocle(cards: SrsCard[], engine: SrsEngine, now: number): number {
  if (!cards.length) return 1;
  return cards.filter((c) => engine.retrievability(c.state, now) >= SOCLE_R).length / cards.length;
}

export const needsListening = (c: SrsCard) => c.listenTotal >= LISTEN_MIN_ATTEMPTS && c.listenOk / c.listenTotal < LISTEN_RATIO_MIN;

/** La Porte s'ouvre quand le parcours est terminé et que le socle tient, dès le jour même. */
export function bossLock(cards: SrsCard[], nodesDone: boolean, engine: SrsEngine, now: number) {
  const socle = computeSocle(cards, engine, now);
  return { socle, nodesDone, open: nodesDone && socle >= SOCLE_FOR_BOSS };
}

export type BossLock = ReturnType<typeof bossLock>;

/** Ce que le joueur doit faire pour ouvrir la Porte, en une phrase. */
export function doorAdvice(lock: BossLock): string {
  if (!lock.nodesDone) return 'Termine d’abord les 12 nœuds de la carte.';
  if (lock.socle < SOCLE_FOR_BOSS) return 'Tes briques se sont usées : pars 5 minutes pour les entretenir.';
  return 'La Porte est prête à s’ouvrir.';
}
