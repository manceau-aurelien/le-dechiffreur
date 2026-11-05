// Ce qu'une session fait à la progression. Partagé par l'interface et par la simulation.
import { exerciseRef } from '../exercise/generate';
import type { AnswerRecord, LessonPlan, LessonState, LessonStep } from '../exercise/lesson';
import type { LessonContent } from '../exercise/types';
import { applyAnswer, completeNode, markPresented, startNode, unsealFormula, veinIsComplete, type ProgressSnapshot } from '../progress/progress';
import type { ReviewLogEntry, SrsEngine } from '../srs/types';

export interface Change {
  next: ProgressSnapshot;
  logs: ReviewLogEntry[];
}

export function beginPlan(p: ProgressSnapshot, plan: LessonPlan): ProgressSnapshot {
  return plan.nodeId ? startNode(p, plan.nodeId) : p;
}

export function enterStep(p: ProgressSnapshot, step: LessonStep | undefined, engine: SrsEngine, now: number): Change {
  if (step?.kind === 'present') return { next: markPresented(p, step.brickId, now), logs: [] };
  if (step?.kind === 'unseal') return unsealFormula(p, step.formulaId, engine, now);
  return { next: p, logs: [] };
}

export function recordAnswer(
  p: ProgressSnapshot,
  answer: AnswerRecord,
  seen: Set<string>,
  sessionId: string | null,
  engine: SrsEngine,
  now: number,
): Change {
  return applyAnswer(
    p,
    {
      targets: answer.exercise.targets,
      result: answer.result,
      replays: answer.replays,
      exerciseType: answer.exercise.type,
      exerciseRef: exerciseRef(answer.exercise),
      source: answer.trial ? 'trial' : 'session',
      sessionId,
      seen,
    },
    engine,
    now,
  );
}

/** En fin de session : le nœud est-il terminé ? */
export function finishPlan(p: ProgressSnapshot, state: LessonState, content: LessonContent, now: number): ProgressSnapshot {
  const nodeId = state.plan.nodeId;
  if (!nodeId) return p;
  const node = content.tier.nodes.find((n) => n.id === nodeId);
  if (!node) return p;
  if (node.kind === 'formula') return state.trialPassed ? completeNode(p, nodeId, now) : p;
  return veinIsComplete(p, node) ? completeNode(p, nodeId, now) : p;
}
