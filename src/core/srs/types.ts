export type Rating = 'again' | 'hard' | 'good';
export type ElementType = 'brick' | 'formula' | 'trap';

/** Seul contrat avec l'algorithme. ts-fsrs n'est importé que par fsrsEngine.ts (§4.2). */
export interface SrsEngine {
  createState(elementId: string, now: number): unknown;
  review(state: unknown, rating: Rating, now: number): EngineCard;
  retrievability(state: unknown, now: number): number;
}

export interface EngineCard {
  state: unknown; // opaque, sérialisable en JSON
  stability: number;
  difficulty: number;
  dueAt: number;
  reps: number;
  lapses: number;
}

/** Mémoire d'un élément (table srs_card, §5.3). R, l'usure et le Socle ne sont jamais stockés. */
export interface SrsCard extends EngineCard {
  elementId: string;
  elementType: ElementType;
  lastReviewAt: number;
  distinctSuccessDays: number;
  lastSuccessDay: number | null;
  listenOk: number;
  listenTotal: number;
  lastWrong: boolean;
  lastFromBoss: boolean;
  recentRefs: string[]; // les trois derniers exercices, pour varier les phrases
}

export interface ReviewLogEntry {
  ts: number;
  sessionId: string | null;
  elementId: string;
  exerciseRef: string;
  exerciseType: string;
  rating: Rating;
  correct: boolean;
  answerRaw: string;
  responseMs: number | null;
  replays: number;
  rBefore: number | null;
  sBefore: number | null;
  sAfter: number;
  source: 'session' | 'trial' | 'boss';
}
