// Le seul fichier autorisé à importer ts-fsrs (§4.2).
import { DefaultScheduler, Rating as FsrsRating } from 'ts-fsrs';
import type { EngineCard, Rating, SrsEngine } from './types';

export const DESIRED_RETENTION = 0.9;

/**
 * FSRS-5, et non FSRS-7, le modèle par défaut de la bibliothèque. Ses préréglages estiment encore un rappel
 * de 81 % un mois après une seule réussite : trop optimiste pour un mot totalement inconnu, et le Socle ne
 * baisserait presque jamais. FSRS-5 descend à 56 % sur la même durée.
 */
export const MODEL_VERSION = 'FSRS-5';

const GRADES = { again: FsrsRating.Again, hard: FsrsRating.Hard, good: FsrsRating.Good } as const;
const DAY_MS = 86_400_000;

/** Les dates reviennent du JSON sous forme de texte : la bibliothèque attend de vraies dates. */
function revive(state: unknown) {
  const raw = state as Record<string, unknown>;
  return {
    ...raw,
    dueAt: new Date(raw.dueAt as string),
    lastReviewAt: raw.lastReviewAt ? new Date(raw.lastReviewAt as string) : null,
  };
}

export async function createFsrsEngine(): Promise<SrsEngine> {
  const scheduler = await DefaultScheduler({
    version: MODEL_VERSION,
    desiredRetention: DESIRED_RETENTION,
    enableShortTerm: false, // c'est le moteur de session qui fait revenir les erreurs (§3.4)
    enableFuzz: false, // comportement déterministe et testable
  });

  return {
    createState(elementId, now) {
      return scheduler.newCard({ cardId: elementId, now: new Date(now) });
    },
    review(state, rating: Rating, now): EngineCard {
      const { card } = scheduler.review({ card: revive(state) as never, grade: GRADES[rating], now: new Date(now) });
      return {
        state: JSON.parse(JSON.stringify(card)),
        stability: card.stability,
        difficulty: card.difficulty,
        dueAt: new Date(card.dueAt).getTime(),
        reps: card.reps,
        lapses: card.lapses,
      };
    },
    retrievability(state, now) {
      const card = revive(state) as never as { lastReviewAt: Date | null };
      if (!card.lastReviewAt) return 0;
      const elapsed = Math.max(0, (now - card.lastReviewAt.getTime()) / DAY_MS);
      return scheduler.model.forgettingCurve(card as never, elapsed);
    },
  };
}
