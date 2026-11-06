// Composition d'une Expédition de 5 minutes (§3.4) et de la Préparation au boss (§3.3).
import type { Sentence, TierNode } from '../../content/schema';
import {
  assemblyExercise,
  authoredExercise,
  brickExercise,
  exerciseRef,
  nodeIndex,
  shuffled,
  themeExercise,
  versionExercise,
} from '../exercise/generate';
import {
  composeFormula,
  composeVein,
  EXERCISE_SECONDS,
  estimateSeconds,
  NEW_BRICK_SECONDS,
  step,
  type LessonPlan,
  type LessonStep,
} from '../exercise/lesson';
import type { Exercise, ExerciseType, LessonContent, Rng } from '../exercise/types';
import { cardList, type ProgressSnapshot } from '../progress/progress';
import { computeSocle, isDue, needsListening, priorityOf, SOCLE_FOR_NEW_NODE } from '../srs/memory';
import type { SrsCard, SrsEngine } from '../srs/types';

export const BUDGET_SECONDS = 300;
export const MAX_REVIEWS = 15;
export const RETRY_SECONDS = 60;
const REVIEW_SHARE_WITH_NEW = 0.7;
const REVIEWS_BEFORE_FORMULA = 3;
const SENTENCE_SECONDS = 25;
const TRAP_SECONDS = 20;
const MAX_PENDING_TRAPS = 3;
const LISTENING: ExerciseType[] = ['E2', 'E6', 'E11'];

export interface ExpeditionContext {
  content: LessonContent;
  progress: ProgressSnapshot;
  engine: SrsEngine;
  now: number;
  rng: Rng;
  budgetSeconds?: number;
}

/** Le prochain nœud à apprendre, boss exclu : le Port, puis le quartier où le joueur est entré. Il choisit seul d'en ouvrir un autre. */
export function nextNode(content: LessonContent, p: ProgressSnapshot): TierNode | undefined {
  const pending = content.tier.nodes.filter((n) => n.kind !== 'boss' && p.nodes[n.id]?.status !== 'completed');
  return pending.find((n) => !n.districtId) ?? pending.find((n) => content.tier.nodes.some((o) => o.districtId === n.districtId && p.nodes[o.id]));
}

/** Le dernier nœud dont les outils sont accessibles. */
function frontierId(content: LessonContent, p: ProgressSnapshot): string {
  const next = nextNode(content, p);
  if (next) {
    const i = nodeIndex(content, next.id);
    return content.tier.nodes[Math.max(0, next.kind === 'vein' ? i : i - 1)].id;
  }
  const lessons = content.tier.nodes.filter((n) => n.kind !== 'boss' && !n.districtId);
  return lessons[lessons.length - 1].id;
}

const brickOf = (c: LessonContent, id: string) => c.bricks.find((b) => b.id === id)!;

/** Le contenu d'un nœud est-il atteint ? Sur le Port, jusqu'à la frontière ; dans un quartier, dès qu'on y a mis les pieds. */
function nodeReached(content: LessonContent, p: ProgressSnapshot, nodeId: string): boolean {
  const node = content.tier.nodes.find((n) => n.id === nodeId);
  if (node?.districtId) return !!p.nodes[nodeId];
  return nodeIndex(content, nodeId) <= nodeIndex(content, frontierId(content, p));
}

/** Une phrase n'est jouable en révision que si toutes ses briques et ses formules sont acquises. */
function usableSentences(ctx: ExpeditionContext): Sentence[] {
  const { content, progress } = ctx;
  return content.sentences.filter((s) => {
    if (!nodeReached(content, progress, s.minNodeId)) return false;
    if (!s.formulaIds.every((f) => progress.cards[f])) return false;
    return s.bricks.every((id) => {
      const b = brickOf(content, id);
      if (b.tracked) return !!progress.cards[id];
      return !b.ownerFormula || !!progress.cards[b.ownerFormula];
    });
  });
}

const known = (p: ProgressSnapshot) => new Set(Object.keys(p.cards).filter((id) => id.startsWith('b.')));

function brickLadder(stability: number): ExerciseType[] {
  if (stability < 1) return ['E2', 'E3'];
  if (stability < 4) return ['E2', 'E4', 'E11'];
  if (stability < 14) return ['E4', 'E5', 'E6'];
  return ['E6', 'E8', 'E11'];
}

function authoredFor(ctx: ExpeditionContext, type: 'E10' | 'E11', elementId: string) {
  return ctx.content.exercises.filter((e) => {
    if (e.type !== type || !e.targets.includes(elementId)) return false;
    return nodeReached(ctx.content, ctx.progress, e.minNodeId);
  });
}

function sentenceExercise(type: ExerciseType, sentenceId: string, ctx: ExpeditionContext): Exercise {
  const frontier = frontierId(ctx.content, ctx.progress);
  if (type === 'E7') return versionExercise(sentenceId, ctx.content, ctx.rng);
  if (type === 'E8') return themeExercise(sentenceId, ctx.content, ctx.rng);
  return assemblyExercise(type as 'E5' | 'E6', sentenceId, ctx.content, frontier, ctx.rng, known(ctx.progress));
}

function brickCardExercise(card: SrsCard, ctx: ExpeditionContext, sentences: Sentence[]): Exercise | null {
  const { content, rng } = ctx;
  const frontier = frontierId(content, ctx.progress);
  const allowed = needsListening(card) ? (['E2', 'E6', 'E11'] as ExerciseType[]) : brickLadder(card.stability);
  const withBrick = sentences.filter((s) => s.bricks.includes(card.elementId) && !card.recentRefs.includes(s.id));
  const e11 = authoredFor(ctx, 'E11', card.elementId).filter((e) => !card.recentRefs.includes(e.id));

  for (const type of shuffled(allowed, rng)) {
    if (type === 'E2' || type === 'E3' || type === 'E4') {
      return brickExercise(type, card.elementId, content, frontier, rng, known(ctx.progress));
    }
    if (type === 'E11' && e11.length) return { ...authoredExercise(shuffled(e11, rng)[0].id, content, rng), targets: [card.elementId] };
    if ((type === 'E5' || type === 'E6' || type === 'E8') && withBrick.length) {
      return { ...sentenceExercise(type, shuffled(withBrick, rng)[0].id, ctx), targets: [card.elementId] };
    }
  }
  // Aucune phrase jouable : le rappel écrit ou l'écoute du mot restent toujours possibles.
  return brickExercise(needsListening(card) ? 'E2' : 'E4', card.elementId, content, frontier, rng, known(ctx.progress));
}

function formulaCardExercise(card: SrsCard, ctx: ExpeditionContext, sentences: Sentence[]): Exercise | null {
  const { rng } = ctx;
  const own = sentences.filter((s) => s.formulaIds.includes(card.elementId) && !card.recentRefs.includes(s.id));
  const e10 = authoredFor(ctx, 'E10', card.elementId).filter((e) => !card.recentRefs.includes(e.id));
  const types = needsListening(card) ? (['E6'] as ExerciseType[]) : shuffled<ExerciseType>(['E5', 'E6', 'E8', 'E10'], rng);
  for (const type of types) {
    if (type === 'E10' && e10.length) return authoredExercise(shuffled(e10, rng)[0].id, ctx.content, rng);
    if (type !== 'E10' && own.length) return { ...sentenceExercise(type, shuffled(own, rng)[0].id, ctx), targets: [card.elementId] };
  }
  return null;
}

function trapCardExercise(card: SrsCard, ctx: ExpeditionContext, sentences: Sentence[]): Exercise | null {
  const trap = ctx.content.traps.find((t) => t.id === card.elementId);
  if (!trap) return null;
  const linked = trap.linkedSentenceId && sentences.find((s) => s.id === trap.linkedSentenceId);
  if (card.stability > 4 && linked) return { ...themeExercise(linked.id, ctx.content, ctx.rng), targets: [card.elementId] };
  return authoredExercise(trap.exerciseIds[0], ctx.content, ctx.rng);
}

/** La forme de l'exercice dépend de la stabilité de la carte (§3.4). */
export function exerciseForCard(card: SrsCard, ctx: ExpeditionContext, sentences = usableSentences(ctx)): Exercise | null {
  if (card.elementType === 'brick') return brickCardExercise(card, ctx, sentences);
  if (card.elementType === 'formula') return formulaCardExercise(card, ctx, sentences);
  return trapCardExercise(card, ctx, sentences);
}

/** Évite deux exercices de même code à la suite, autant que possible. */
export function interleave(exercises: Exercise[]): Exercise[] {
  const pool = [...exercises];
  const out: Exercise[] = [];
  while (pool.length) {
    const last = out[out.length - 1]?.type;
    const i = pool.findIndex((e) => e.type !== last);
    out.push(...pool.splice(i < 0 ? 0 : i, 1));
  }
  return out;
}

/** Quand seules restent des briques, deux rappels identiques à la suite changent de forme. */
export function varyForms(exercises: Exercise[], ctx: ExpeditionContext): Exercise[] {
  const frontier = frontierId(ctx.content, ctx.progress);
  const out = [...exercises];
  for (let i = 1; i < out.length; i++) {
    const ex = out[i];
    if (ex.type !== out[i - 1].type || (ex.type !== 'E2' && ex.type !== 'E3' && ex.type !== 'E4')) continue;
    const after = out[i + 1]?.type;
    const form = (['E3', 'E4', 'E2'] as const).find((t) => t !== ex.type && t !== after) ?? 'E3';
    out[i] = brickExercise(form, ex.brickId, ctx.content, frontier, ctx.rng, known(ctx.progress));
  }
  return out;
}

/** Au moins un exercice d'écoute par tranche de 4 : un rappel écrit devient une écoute. */
export function ensureListening(exercises: Exercise[], ctx: ExpeditionContext): Exercise[] {
  const out = [...exercises];
  const frontier = frontierId(ctx.content, ctx.progress);
  for (let i = 0; i < out.length; i += 4) {
    const slice = out.slice(i, i + 4);
    if (slice.length < 4 || slice.some((e) => LISTENING.includes(e.type))) continue;
    const j = slice.findIndex((e) => e.type === 'E3' || e.type === 'E4' || e.type === 'E5');
    if (j < 0) continue;
    const ex = slice[j];
    if (ex.type === 'E3' || ex.type === 'E4') {
      out[i + j] = brickExercise('E2', ex.brickId, ctx.content, frontier, ctx.rng, known(ctx.progress));
    } else if (ex.type === 'E5') {
      out[i + j] = { ...ex, type: 'E6' };
    }
  }
  return out;
}

function retryStep(exercise: Exercise, ctx: ExpeditionContext): LessonStep {
  return step(exercise, ctx.content, frontierId(ctx.content, ctx.progress), ctx.rng, false, known(ctx.progress));
}

/** Choisit les cartes les plus urgentes dans le budget. */
function pickReviews(ctx: ExpeditionContext, budget: number, maxCount: number): Exercise[] {
  const { progress, engine, now } = ctx;
  const sentences = usableSentences(ctx);
  const rows = cardList(progress).map((card) => {
    const r = engine.retrievability(card.state, now);
    return { card, r, due: isDue(card, r, now), priority: priorityOf(card, r) };
  });
  const due = rows.filter((x) => x.due).sort((a, b) => b.priority - a.priority);
  const out: Exercise[] = [];
  let spent = 0;
  for (const { card } of due) {
    if (out.length >= maxCount) break;
    const ex = exerciseForCard(card, ctx, sentences);
    if (!ex) continue;
    const cost = EXERCISE_SECONDS[ex.type];
    if (spent + cost > budget) continue;
    out.push(ex);
    spent += cost;
  }
  return out;
}

/** Cartes à faire varier quand rien n'est dû : celles dont la mémoire est la plus basse. */
function pickLowest(ctx: ExpeditionContext, count: number): Exercise[] {
  const sentences = usableSentences(ctx);
  return cardList(ctx.progress)
    .map((card) => ({ card, r: ctx.engine.retrievability(card.state, ctx.now) }))
    .sort((a, b) => a.r - b.r)
    .slice(0, count)
    .flatMap(({ card }) => exerciseForCard(card, ctx, sentences) ?? []);
}

/** Termine sur une phrase entière réussissable, si elle existe. */
function closingSentence(ctx: ExpeditionContext, used: Set<string>): Exercise | null {
  const { content, progress, engine, now, rng } = ctx;
  const ok = usableSentences(ctx).filter(
    (s) =>
      !used.has(s.id) &&
      s.bricks.every((id) => {
        const card = progress.cards[id];
        return !card || engine.retrievability(card.state, now) >= 0.8;
      }),
  );
  const pick = shuffled(ok, rng)[0];
  return pick ? assemblyExercise('E5', pick.id, content, frontierId(content, progress), rng, known(progress)) : null;
}

/** Les pièges d'un nœud terminé, jamais rencontrés : un filon peut finir avant que ses pièges n'aient eu leur tour. */
export function pendingTraps(content: LessonContent, p: ProgressSnapshot): string[] {
  return content.tier.nodes
    .filter((n) => p.nodes[n.id]?.status === 'completed')
    .flatMap((n) => n.trapIds ?? [])
    .filter((t) => !p.cards[t]);
}

/** Peut-on commencer du contenu neuf ? Le mode développeur ignore le verrou. */
export function canStartNew(ctx: Pick<ExpeditionContext, 'progress' | 'engine' | 'now'>): boolean {
  return ctx.progress.devUnlockAll || computeSocle(cardList(ctx.progress), ctx.engine, ctx.now) >= SOCLE_FOR_NEW_NODE;
}

export function composeExpedition(ctx: ExpeditionContext): LessonPlan {
  const { content, progress, rng } = ctx;
  const budget = ctx.budgetSeconds ?? BUDGET_SECONDS;
  const node = nextNode(content, progress);
  const newNode = node && canStartNew(ctx) ? node : undefined;

  // Les pièges en attente passent avant les révisions : une carte y gagne sa place dans le Bestiaire.
  const traps = pendingTraps(content, progress).slice(0, MAX_PENDING_TRAPS);
  const trapExercises = traps.map((t) => authoredExercise(content.traps.find((x) => x.id === t)!.exerciseIds[0], content, rng));
  const trapCost = trapExercises.length * TRAP_SECONDS;

  let reviews: Exercise[];
  let newPlan: LessonPlan | null = null;

  if (newNode?.kind === 'formula') {
    reviews = pickReviews(ctx, budget, Math.max(0, REVIEWS_BEFORE_FORMULA - trapExercises.length));
    newPlan = composeFormula(newNode, content, progress, rng);
  } else if (newNode?.kind === 'vein') {
    reviews = pickReviews(ctx, budget * REVIEW_SHARE_WITH_NEW - trapCost, MAX_REVIEWS - trapExercises.length);
    const spent = reviews.reduce((sum, e) => sum + EXERCISE_SECONDS[e.type], 0);
    let left = budget - spent - trapCost;
    const maxNew = Math.max(1, Math.min(5, Math.floor(left / NEW_BRICK_SECONDS)));
    left -= maxNew * NEW_BRICK_SECONDS;
    const maxSentences = Math.max(0, Math.min(2, Math.floor(left / SENTENCE_SECONDS)));
    left -= maxSentences * SENTENCE_SECONDS;
    const maxTraps = Math.max(0, Math.min(3, Math.floor(left / TRAP_SECONDS)));
    newPlan = composeVein(newNode, content, progress, rng, { maxNew, maxSentences, maxTraps });
  } else {
    reviews = pickReviews(ctx, budget - trapCost, MAX_REVIEWS - trapExercises.length);
    if (!reviews.length && !trapExercises.length) reviews = pickLowest(ctx, 8);
  }

  const ordered = ensureListening(varyForms(interleave([...trapExercises, ...reviews]), ctx), ctx);
  const reviewSteps = ordered.map((e) => retryStep(e, ctx));
  const steps: LessonStep[] = [...reviewSteps, ...(newPlan?.steps ?? [])];
  const isTrial = !!newPlan?.passMin;

  // Une épreuve de formule décide de la fin : pas de phrase de clôture après elle.
  if (!isTrial && steps.length) {
    const used = new Set(ordered.map(exerciseRef));
    const closing = closingSentence(ctx, used);
    if (closing && estimateSeconds(steps) + SENTENCE_SECONDS <= budget + SENTENCE_SECONDS) steps.push(retryStep(closing, ctx));
  }

  return {
    kind: 'expedition',
    nodeId: newPlan?.nodeId ?? null,
    retrySeconds: RETRY_SECONDS,
    steps,
    afterPass: newPlan?.afterPass ?? [],
    passMin: newPlan?.passMin ?? null,
    trialPicked: newPlan?.trialPicked ?? [],
  };
}

/** La Préparation après deux défaites : seulement les éléments fautifs, avec E2, E6 et E11 (§3.3). */
export function composePreparation(elementIds: string[], ctx: ExpeditionContext): LessonPlan {
  const { content, rng } = ctx;
  const frontier = frontierId(content, ctx.progress);
  const sentences = usableSentences(ctx);
  const exercises: Exercise[] = [];
  for (const id of elementIds.slice(0, MAX_REVIEWS)) {
    const e11 = authoredFor(ctx, 'E11', id);
    const withElement = sentences.filter((s) => s.bricks.includes(id) || s.formulaIds.includes(id));
    if (id.startsWith('b.')) {
      if (e11.length && rng() < 0.5) exercises.push({ ...authoredExercise(e11[0].id, content, rng), targets: [id] });
      else if (withElement.length && rng() < 0.5) exercises.push({ ...sentenceExercise('E6', shuffled(withElement, rng)[0].id, ctx), targets: [id] });
      else exercises.push(brickExercise('E2', id, content, frontier, rng, known(ctx.progress)));
    } else if (id.startsWith('f.')) {
      if (withElement.length) exercises.push({ ...sentenceExercise('E6', shuffled(withElement, rng)[0].id, ctx), targets: [id] });
    } else if (ctx.progress.cards[id]) {
      const card = ctx.progress.cards[id];
      const ex = trapCardExercise(card, ctx, sentences);
      if (ex) exercises.push(ex);
    }
  }
  return {
    kind: 'prep',
    nodeId: null,
    retrySeconds: RETRY_SECONDS,
    steps: interleave(exercises).map((e) => retryStep(e, ctx)),
    afterPass: [],
    passMin: null,
    trialPicked: [],
  };
}

/** « Encore 5 minutes » n'apparaît que s'il reste quelque chose d'utile à faire. */
export function hasUsefulWork(ctx: Pick<ExpeditionContext, 'content' | 'progress' | 'engine' | 'now'>): boolean {
  const { progress, engine, now, content } = ctx;
  const due = cardList(progress).some((c) => isDue(c, engine.retrievability(c.state, now), now));
  return due || pendingTraps(content, progress).length > 0 || (!!nextNode(content, progress) && canStartNew(ctx));
}
