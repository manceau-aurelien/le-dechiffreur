// Ce que le combat apprend à la mémoire : une seule mise à jour par élément, à la fin (§3.3, §3.4).
import type { Brick } from '../../content/schema';
import type { ProgressSnapshot } from '../progress/progress';
import { reviewCard } from '../srs/memory';
import type { Rating, ReviewLogEntry, SrsEngine } from '../srs/types';
import type { BossState, RoundResult } from './engine';

const SEVERITY: Record<Rating, number> = { good: 0, hard: 1, again: 2 };

/** L'élément fautif d'une séquence fausse : brique manquante, outil renvoyé à sa formule, ordre renvoyé à la formule du rang. */
function sequenceBlame(result: RoundResult, bricks: Brick[]): string[] {
  const left = [...result.placed];
  const missing: string[] = [];
  for (const id of result.variant.tokens) {
    const i = left.indexOf(id);
    if (i >= 0) left.splice(i, 1);
    else missing.push(id);
  }
  const elements = missing.flatMap((id) => {
    const b = bricks.find((x) => x.id === id);
    if (!b) return [];
    if (b.tracked) return [b.id];
    return b.ownerFormula ? [b.ownerFormula] : [];
  });
  if (elements.length) return [...new Set(elements)];
  return result.variant.pivotElements.filter((e) => e.startsWith('f.')).slice(0, 1);
}

function rippleBlame(result: RoundResult): string[] {
  const option = result.riposteChoice !== null ? result.variant.riposte?.options[result.riposteChoice] : undefined;
  if (option?.blame) return [option.blame];
  return result.variant.pivotElements.filter((e) => e.startsWith('f.')).slice(0, 1);
}

/** Note de chaque élément. Une faute l'emporte sur une réussite du même combat. */
export function bossRatings(state: BossState, bricks: Brick[]): Map<string, Rating> {
  const ratings = new Map<string, Rating>();
  const put = (id: string, rating: Rating) => {
    const current = ratings.get(id);
    if (!current || SEVERITY[rating] > SEVERITY[current]) ratings.set(id, rating);
  };
  for (const r of state.results) {
    if (r.outcome === 'ok') r.variant.pivotElements.forEach((el) => put(el, r.slowUsed > 0 ? 'hard' : 'good'));
    else (r.outcome === 'sequence' ? sequenceBlame(r, bricks) : rippleBlame(r)).forEach((el) => put(el, 'again'));
  }
  return ratings;
}

export function blamedElements(state: BossState, bricks: Brick[]): string[] {
  return [...bossRatings(state, bricks)].filter(([, rating]) => rating === 'again').map(([id]) => id);
}

/** Applique le combat à la mémoire. Un élément sans carte (accès en mode développeur) est ignoré. */
export function applyBossResults(p: ProgressSnapshot, state: BossState, bricks: Brick[], engine: SrsEngine, now: number) {
  let next = p;
  const logs: ReviewLogEntry[] = [];
  for (const [id, rating] of bossRatings(state, bricks)) {
    const card = next.cards[id];
    if (!card) continue;
    const reviewed = reviewCard(card, rating, engine, now, { fromBoss: true, listening: true });
    next = { ...next, cards: { ...next.cards, [id]: reviewed } };
    logs.push({
      ts: now,
      sessionId: null,
      elementId: id,
      exerciseRef: 'boss',
      exerciseType: 'boss',
      rating,
      correct: rating !== 'again',
      answerRaw: '',
      responseMs: null,
      replays: 0,
      rBefore: engine.retrievability(card.state, now),
      sBefore: card.stability,
      sAfter: reviewed.stability,
      source: 'boss',
    });
  }
  return { next, logs };
}
