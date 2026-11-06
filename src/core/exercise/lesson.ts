// Composition et déroulement d'une leçon : filon ou épreuve de formule (§3.1, §3.2).
import type { TierNode } from '../../content/schema';
import type { ProgressSnapshot } from '../progress/progress';
import {
  assemblyExercise,
  authoredExercise,
  brickExercise,
  formulaOf,
  isBeforeOrSame,
  retryExercise,
  sentencesUpTo,
  shuffled,
  themeExercise,
  versionExercise,
} from './generate';
import type { CheckResult, Exercise, ExerciseType, LessonContent, Rng } from './types';

export type LessonStep =
  | { kind: 'intro'; text: string }
  | { kind: 'present'; brickId: string }
  | { kind: 'clue'; sentenceId: string }
  | { kind: 'hypothesis'; formulaId: string }
  | { kind: 'unseal'; formulaId: string }
  | { kind: 'exercise'; exercise: Exercise; retry: Exercise | null; trial: boolean; isRetry: boolean };

export interface LessonPlan {
  kind: 'lesson' | 'expedition' | 'prep';
  nodeId: string | null; // le nœud dont le plan fait avancer le contenu neuf
  retrySeconds: number; // budget des retours d'erreurs en fin de session
  steps: LessonStep[];
  afterPass: LessonStep[]; // suite d'une épreuve réussie
  passMin: number | null; // non nul pour une épreuve de formule
  trialPicked: string[]; // candidats tirés, à éviter au prochain essai
}

export const NEW_BRICKS_PER_LESSON = 5;
export const TRAPS_PER_LESSON = 3;

/** Durées estimées du §3.1, en secondes. */
export const EXERCISE_SECONDS: Record<ExerciseType, number> = {
  E2: 10,
  E3: 10,
  E4: 10,
  E5: 25,
  E6: 25,
  E7: 25,
  E8: 35,
  E9: 20,
  E10: 20,
  E11: 15,
};
export const PRESENT_SECONDS = 15;
export const NEW_BRICK_SECONDS = PRESENT_SECONDS + 2 * 10; // présentation, test immédiat, rappel

export function estimateSeconds(steps: LessonStep[]): number {
  return steps.reduce((sum, s) => {
    if (s.kind === 'exercise') return sum + EXERCISE_SECONDS[s.exercise.type];
    if (s.kind === 'present') return sum + PRESENT_SECONDS;
    return sum + 8;
  }, 0);
}

export function step(exercise: Exercise, content: LessonContent, nodeId: string, rng: Rng, trial = false, known?: ReadonlySet<string>): LessonStep {
  return { kind: 'exercise', exercise, retry: trial ? null : retryExercise(exercise, content, nodeId, rng, known), trial, isRetry: false };
}

export interface VeinLimits {
  maxNew?: number;
  maxSentences?: number;
  maxTraps?: number;
}

/** Un filon : jusqu'à 5 briques neuves, leurs tests, leurs phrases et leurs pièges. */
export function composeVein(node: TierNode, content: LessonContent, progress: ProgressSnapshot, rng: Rng, limits: VeinLimits = {}): LessonPlan {
  const all = node.brickIds ?? [];
  const pending = all.filter((id) => !progress.bricks[id]?.firstCorrectAt);
  const fresh = pending.slice(0, limits.maxNew ?? NEW_BRICKS_PER_LESSON);
  const steps: LessonStep[] = [];
  const firstVisit = !all.some((id) => progress.bricks[id]?.presentedAt);
  if (node.intro && firstVisit) steps.push({ kind: 'intro', text: node.intro });

  // Tout est déjà acquis : le nœud se rejoue en pratique, sans présentation.
  const focus = fresh.length ? fresh : shuffled(all, rng).slice(0, NEW_BRICKS_PER_LESSON);

  // Ce que le joueur a déjà rencontré, enrichi brique après brique : rien d'inconnu dans les choix, si possible.
  const known = new Set(
    content.bricks
      .filter((b) => b.tracked && ((b.nodeId !== node.id && isBeforeOrSame(content, b.nodeId, node.id)) || progress.bricks[b.id]?.presentedAt))
      .map((b) => b.id),
  );
  if (fresh.length) {
    for (const id of fresh) {
      steps.push({ kind: 'present', brickId: id });
      known.add(id);
      const type = rng() < 0.5 ? 'E2' : 'E3';
      steps.push(step(brickExercise(type, id, content, node.id, rng, new Set(known)), content, node.id, rng, false, new Set(known)));
    }
  } else {
    all.forEach((id) => known.add(id));
  }
  // Le rappel alterne les formes : jamais deux fois le même exercice de suite.
  shuffled(focus, rng).forEach((id, i) => {
    const type = i % 2 === 0 ? 'E4' : 'E3';
    steps.push(step(brickExercise(type, id, content, node.id, rng, known), content, node.id, rng, false, known));
  });

  // Les phrases de ce nœud contenant ces briques, quand la grammaire le permet déjà.
  const usable = shuffled(
    sentencesUpTo(content, node.id).filter((s) => {
      const allKnown = s.bricks.every((b) => !content.bricks.find((x) => x.id === b)!.tracked || known.has(b));
      return allKnown && s.bricks.some((b) => focus.includes(b));
    }),
    rng,
  ).slice(0, limits.maxSentences ?? 2);
  usable.forEach((s, i) => {
    steps.push(step(assemblyExercise(i === 0 ? 'E5' : 'E6', s.id, content, node.id, rng, known), content, node.id, rng, false, known));
  });

  const unseenTraps = (node.trapIds ?? []).filter((t) => !progress.cards[t]);
  const traps = (unseenTraps.length ? unseenTraps : shuffled(node.trapIds ?? [], rng)).slice(0, limits.maxTraps ?? TRAPS_PER_LESSON);
  for (const t of traps) {
    const trap = content.traps.find((x) => x.id === t)!;
    steps.push(step(authoredExercise(trap.exerciseIds[0], content, rng), content, node.id, rng));
  }

  return { kind: 'lesson', nodeId: node.id, retrySeconds: Infinity, steps, afterPass: [], passMin: null, trialPicked: [] };
}

/** Une formule : indices, hypothèse, épreuve de six exercices. */
export function composeFormula(
  node: TierNode,
  content: LessonContent,
  progress: ProgressSnapshot,
  rng: Rng,
  lastPicked: string[] = [],
): LessonPlan {
  const formula = formulaOf(content, node.formulaId!);
  const steps: LessonStep[] = [];
  if (node.intro && !progress.nodes[node.id]) steps.push({ kind: 'intro', text: node.intro });
  for (const c of formula.clueSentenceIds) steps.push({ kind: 'clue', sentenceId: c });
  steps.push({ kind: 'hypothesis', formulaId: formula.id });

  const trialPicked: string[] = [];
  const trialIds = new Set<string>();
  for (const position of formula.trial.positions) {
    const fresh = position.filter((r) => !lastPicked.includes(r.id));
    const ref = shuffled(fresh.length ? fresh : position, rng)[0];
    trialPicked.push(ref.id);
    trialIds.add(ref.id);
    const ex =
      ref.type === 'E8'
        ? themeExercise(ref.id, content, rng)
        : ref.type === 'E5' || ref.type === 'E6'
          ? assemblyExercise(ref.type, ref.id, content, node.id, rng)
          : authoredExercise(ref.id, content, rng);
    steps.push(step(ex, content, node.id, rng, true));
  }

  // Après l'épreuve : la règle révélée, puis les pièges du nœud et une version.
  const afterPass: LessonStep[] = [{ kind: 'unseal', formulaId: formula.id }];
  for (const t of node.trapIds ?? []) {
    const trap = content.traps.find((x) => x.id === t)!;
    if (!trialIds.has(trap.exerciseIds[0])) {
      afterPass.push(step(authoredExercise(trap.exerciseIds[0], content, rng), content, node.id, rng));
    }
  }
  const extra = content.sentences.filter((s) => s.minNodeId === node.id && !trialIds.has(s.id) && !formula.clueSentenceIds.includes(s.id));
  const pick = shuffled(extra, rng)[0];
  if (pick) afterPass.push(step(versionExercise(pick.id, content, rng), content, node.id, rng));

  return { kind: 'lesson', nodeId: node.id, retrySeconds: Infinity, steps, afterPass, passMin: formula.trial.passMin, trialPicked };
}

export function composeLesson(node: TierNode, content: LessonContent, progress: ProgressSnapshot, rng: Rng, lastPicked: string[] = []): LessonPlan {
  if (node.kind === 'vein') return composeVein(node, content, progress, rng);
  if (node.kind === 'formula') return composeFormula(node, content, progress, rng, lastPicked);
  throw new Error(`Ce nœud n'a pas de leçon : ${node.id}`);
}

// --- Déroulement ---

export interface AnswerRecord {
  exercise: Exercise;
  result: CheckResult;
  trial: boolean;
  isRetry: boolean;
  replays: number;
}

export type LessonStage = 'step' | 'feedback' | 'trial_failed' | 'done';

export interface LessonState {
  plan: LessonPlan;
  steps: LessonStep[];
  index: number;
  stage: LessonStage;
  lastResult: CheckResult | null;
  answers: AnswerRecord[];
  trialCorrect: number;
  trialTotal: number;
  trialLastCorrect: boolean;
  trialPassed: boolean;
  retrySecondsLeft: number;
}

export type LessonAction = { type: 'ANSWER'; result: CheckResult; replays?: number } | { type: 'NEXT' };

export function createLessonState(plan: LessonPlan): LessonState {
  return {
    plan,
    steps: plan.steps,
    index: 0,
    stage: 'step',
    lastResult: null,
    answers: [],
    trialCorrect: 0,
    trialTotal: 0,
    trialLastCorrect: false,
    trialPassed: false,
    retrySecondsLeft: plan.retrySeconds,
  };
}

export const currentStep = (s: LessonState): LessonStep | undefined => s.steps[s.index];
export const hasTrial = (p: LessonPlan) => p.passMin !== null;

function advance(s: LessonState): LessonState {
  const index = s.index + 1;
  if (index < s.steps.length) return { ...s, index, stage: 'step', lastResult: null };
  if (hasTrial(s.plan) && !s.trialPassed) {
    const passed = s.trialCorrect >= s.plan.passMin! && s.trialLastCorrect;
    if (!passed) return { ...s, index, stage: 'trial_failed', lastResult: null };
    return { ...s, index, steps: [...s.steps, ...s.plan.afterPass], stage: 'step', trialPassed: true, lastResult: null };
  }
  return { ...s, index, stage: 'done', lastResult: null };
}

export function lessonReducer(s: LessonState, a: LessonAction): LessonState {
  if (s.stage === 'done' || s.stage === 'trial_failed') return s;
  const current = currentStep(s);

  if (a.type === 'NEXT') {
    if (s.stage === 'step' && current?.kind === 'exercise') return s; // il faut répondre d'abord
    return advance(s);
  }

  // ANSWER
  if (s.stage !== 'step' || current?.kind !== 'exercise') return s;
  const answers = [...s.answers, { exercise: current.exercise, result: a.result, trial: current.trial, isRetry: current.isRetry, replays: a.replays ?? 0 }];
  let steps = s.steps;
  let retrySecondsLeft = s.retrySecondsLeft;
  // L'élément raté revient une fois en fin de session, sous une autre forme, dans la limite du budget.
  if (!a.result.correct && current.retry && !current.isRetry) {
    const cost = EXERCISE_SECONDS[current.retry.type];
    if (cost <= retrySecondsLeft) {
      steps = [...steps, { kind: 'exercise', exercise: current.retry, retry: null, trial: false, isRetry: true }];
      retrySecondsLeft -= cost;
    }
  }
  return {
    ...s,
    steps,
    answers,
    retrySecondsLeft,
    stage: 'feedback',
    lastResult: a.result,
    trialCorrect: s.trialCorrect + (current.trial && a.result.correct ? 1 : 0),
    trialTotal: s.trialTotal + (current.trial ? 1 : 0),
    trialLastCorrect: current.trial ? a.result.correct : s.trialLastCorrect,
  };
}

/** Avancement de 0 à 1, pour la barre de la leçon. */
export function lessonProgress(s: LessonState): number {
  const total = s.steps.length + (hasTrial(s.plan) && !s.trialPassed ? s.plan.afterPass.length : 0);
  return total === 0 ? 1 : Math.min(1, s.index / total);
}
