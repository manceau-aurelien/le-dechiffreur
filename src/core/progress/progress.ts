// État du joueur et ses transitions. Fonctions pures : le stockage est ailleurs.
import type { Tier, TierNode } from '../../content/schema';
import type { CheckResult, ExerciseType } from '../exercise/types';
import { bossLock, newCard, ratingFor, reviewCard } from '../srs/memory';
import type { ReviewLogEntry, SrsCard, SrsEngine } from '../srs/types';

export type NodeStatus = 'locked' | 'available' | 'in_progress' | 'completed';

export interface ProgressSnapshot {
  version: 2;
  nodes: Record<string, { status: 'in_progress' | 'completed'; completedAt?: number; attempts: number }>;
  bricks: Record<string, { presentedAt?: number; firstCorrectAt?: number }>;
  cards: Record<string, SrsCard>;
  devUnlockAll: boolean;
  bossOpened: boolean; // une fois ouverte, la porte le reste (§2.4)
  clockOffsetMs: number; // mode développeur : avancer le temps
  onboarded: boolean; // le premier lancement a eu lieu
}

export const emptyProgress = (): ProgressSnapshot => ({
  version: 2,
  nodes: {},
  bricks: {},
  cards: {},
  devUnlockAll: false,
  bossOpened: false,
  clockOffsetMs: 0,
  onboarded: false,
});

export const cardList = (p: ProgressSnapshot) => Object.values(p.cards);

export function nodeStatus(tier: Tier, p: ProgressSnapshot, node: TierNode): NodeStatus {
  const own = p.nodes[node.id];
  if (own?.status === 'completed') return 'completed';
  if (own?.status === 'in_progress') return 'in_progress';
  if (p.devUnlockAll) return 'available';
  if (node.kind === 'boss') return p.bossOpened ? 'available' : 'locked';
  const index = tier.nodes.findIndex((n) => n.id === node.id);
  const previous = tier.nodes[index - 1];
  if (!previous) return 'available';
  return p.nodes[previous.id]?.status === 'completed' ? 'available' : 'locked';
}

export function allNodesDone(tier: Tier, p: ProgressSnapshot): boolean {
  return tier.nodes.filter((n) => n.kind !== 'boss').every((n) => p.nodes[n.id]?.status === 'completed');
}

/** Ouvre la porte dès que les conditions sont réunies. Elle ne se referme jamais. */
export function refreshBossDoor(tier: Tier, p: ProgressSnapshot, engine: SrsEngine, now: number): ProgressSnapshot {
  if (p.bossOpened) return p;
  return bossLock(cardList(p), allNodesDone(tier, p), engine, now).open ? { ...p, bossOpened: true } : p;
}

export function startNode(p: ProgressSnapshot, nodeId: string): ProgressSnapshot {
  const own = p.nodes[nodeId];
  if (own?.status === 'completed') return { ...p, nodes: { ...p.nodes, [nodeId]: { ...own, attempts: own.attempts + 1 } } };
  return { ...p, nodes: { ...p.nodes, [nodeId]: { status: 'in_progress', attempts: (own?.attempts ?? 0) + 1 } } };
}

export function markPresented(p: ProgressSnapshot, brickId: string, now: number): ProgressSnapshot {
  if (p.bricks[brickId]?.presentedAt) return p;
  return { ...p, bricks: { ...p.bricks, [brickId]: { ...p.bricks[brickId], presentedAt: now } } };
}

/** Une brique réussie au moins une fois. */
export function markCorrect(p: ProgressSnapshot, targets: string[], now: number): ProgressSnapshot {
  let next = p;
  for (const t of targets) {
    if (t.startsWith('b.') && !next.bricks[t]?.firstCorrectAt) {
      next = { ...next, bricks: { ...next.bricks, [t]: { ...next.bricks[t], firstCorrectAt: now } } };
    }
  }
  return next;
}

/** Un filon est terminé quand chacune de ses briques a été réussie au moins une fois. */
export function veinIsComplete(p: ProgressSnapshot, node: TierNode): boolean {
  return (node.brickIds ?? []).every((id) => p.bricks[id]?.firstCorrectAt);
}

export function completeNode(p: ProgressSnapshot, nodeId: string, now: number): ProgressSnapshot {
  const own = p.nodes[nodeId];
  return { ...p, nodes: { ...p.nodes, [nodeId]: { status: 'completed', completedAt: own?.completedAt ?? now, attempts: own?.attempts ?? 1 } } };
}

export function bricksLearned(p: ProgressSnapshot): number {
  return Object.values(p.bricks).filter((b) => b.firstCorrectAt).length;
}

const LISTENING: ExerciseType[] = ['E2', 'E6', 'E11'];

export interface AnswerInput {
  targets: string[];
  result: Pick<CheckResult, 'correct' | 'almost' | 'blame' | 'given'>;
  replays: number;
  exerciseType: ExerciseType;
  exerciseRef: string;
  source: ReviewLogEntry['source'];
  sessionId: string | null;
  seen: Set<string>; // éléments déjà notés dans cette session : seule la première réponse compte
}

/** Qui reçoit une carte à sa première rencontre : une brique déjà présentée, ou un piège. */
function canCreateCard(p: ProgressSnapshot, id: string): boolean {
  if (id.startsWith('t.')) return true;
  return id.startsWith('b.') && !!p.bricks[id]?.presentedAt;
}

/** Applique une réponse à la mémoire (§3.4). Renvoie le nouvel état et les lignes du journal. */
export function applyAnswer(p: ProgressSnapshot, input: AnswerInput, engine: SrsEngine, now: number) {
  const { result, targets, seen } = input;
  const listening = LISTENING.includes(input.exerciseType);
  const elements = result.correct ? targets : result.blame.length ? result.blame : targets;
  let next = result.correct ? markCorrect(p, targets, now) : p;
  const logs: ReviewLogEntry[] = [];

  for (const id of elements) {
    if (seen.has(id)) continue;
    const existing = next.cards[id];
    if (!existing && !canCreateCard(next, id)) continue;
    // Une brique jamais réussie n'a pas de mémoire à perdre : sa carte attend la première réussite.
    if (!existing && id.startsWith('b.') && !result.correct) {
      seen.add(`raté:${id}`);
      continue;
    }
    let rating = ratingFor(result, input.replays, listening);
    if (rating === 'good' && seen.has(`raté:${id}`)) rating = 'hard';
    const before = existing ?? newCard(id, engine, now);
    const reviewed = reviewCard(before, rating, engine, now, { listening, exerciseRef: input.exerciseRef });
    next = { ...next, cards: { ...next.cards, [id]: reviewed } };
    seen.add(id);
    logs.push({
      ts: now,
      sessionId: input.sessionId,
      elementId: id,
      exerciseRef: input.exerciseRef,
      exerciseType: input.exerciseType,
      rating,
      correct: result.correct,
      answerRaw: result.given,
      responseMs: null,
      replays: input.replays,
      rBefore: existing ? engine.retrievability(existing.state, now) : null,
      sBefore: existing ? existing.stability : null,
      sAfter: reviewed.stability,
      source: input.source,
    });
  }
  return { next, logs };
}

/** L'épreuve réussie : la formule entre en mémoire, notée Bon (§3.2). */
export function unsealFormula(p: ProgressSnapshot, formulaId: string, engine: SrsEngine, now: number) {
  if (p.cards[formulaId]) return { next: p, logs: [] as ReviewLogEntry[] };
  const reviewed = reviewCard(newCard(formulaId, engine, now), 'good', engine, now);
  const log: ReviewLogEntry = {
    ts: now,
    sessionId: null,
    elementId: formulaId,
    exerciseRef: 'trial',
    exerciseType: 'trial',
    rating: 'good',
    correct: true,
    answerRaw: '',
    responseMs: null,
    replays: 0,
    rBefore: null,
    sBefore: null,
    sAfter: reviewed.stability,
    source: 'trial',
  };
  return { next: { ...p, cards: { ...p.cards, [formulaId]: reviewed } }, logs: [log] };
}
