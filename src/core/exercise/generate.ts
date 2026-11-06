// Fabrique les exercices depuis les briques et les phrases. Les E9, E10 et E11 sont rédigés.
import type { AuthoredExercise, Brick, Formula, Sentence } from '../../content/schema';
import { frenchTiles } from './check';
import type { Exercise, LessonContent, Rng, Voice } from './types';

export function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const pickVoice = (rng: Rng): Voice => (rng() < 0.5 ? 'voiceA' : 'voiceB');

export function nodeIndex(content: LessonContent, nodeId: string): number {
  return content.tier.nodes.findIndex((n) => n.id === nodeId);
}

/** Depuis un nœud, voit-on un autre nœud ? Un quartier ne dépend que du Port et de lui-même. */
export function isBeforeOrSame(content: LessonContent, otherId: string, nodeId: string): boolean {
  const other = content.tier.nodes.find((n) => n.id === otherId);
  const node = content.tier.nodes.find((n) => n.id === nodeId);
  if (!other || !node || nodeIndex(content, otherId) > nodeIndex(content, nodeId)) return false;
  return !other.districtId || other.districtId === node.districtId;
}

/** Une brique est disponible à partir de son nœud d'introduction, ou dès que le joueur la connaît. */
export function bricksUpTo(content: LessonContent, nodeId: string, known?: ReadonlySet<string>): Brick[] {
  return content.bricks.filter((b) => isBeforeOrSame(content, b.nodeId, nodeId) || known?.has(b.id));
}

export function sentencesUpTo(content: LessonContent, nodeId: string): Sentence[] {
  return content.sentences.filter((s) => isBeforeOrSame(content, s.minNodeId, nodeId));
}

export function brick(content: LessonContent, id: string): Brick {
  const found = content.bricks.find((b) => b.id === id);
  if (!found) throw new Error(`Brique inconnue : ${id}`);
  return found;
}

export function sentence(content: LessonContent, id: string): Sentence {
  const found = content.sentences.find((s) => s.id === id);
  if (!found) throw new Error(`Phrase inconnue : ${id}`);
  return found;
}

export function authored<T extends AuthoredExercise['type']>(
  content: LessonContent,
  id: string,
  type: T,
): Extract<AuthoredExercise, { type: T }> {
  const found = content.exercises.find((e) => e.id === id);
  if (!found || found.type !== type) throw new Error(`Exercice inconnu : ${id}`);
  return found as Extract<AuthoredExercise, { type: T }>;
}

export function formulaOf(content: LessonContent, id: string): Formula {
  const found = content.formulas.find((f) => f.id === id);
  if (!found) throw new Error(`Formule inconnue : ${id}`);
  return found;
}

/** Choix d'une brique parmi 3 ou 4 : d'abord les plus proches à l'oreille, puis des briques du même nœud. */
export function brickExercise(
  type: 'E2' | 'E3' | 'E4',
  brickId: string,
  content: LessonContent,
  nodeId: string,
  rng: Rng,
  known?: ReadonlySet<string>,
): Exercise {
  const target = brick(content, brickId);
  const available = bricksUpTo(content, nodeId, known).filter((b) => b.tracked && b.id !== brickId);
  const availableIds = new Set(available.map((b) => b.id));
  const isKnown = (id: string) => !known || known.has(id);
  const near = target.confusableWith.filter((id) => availableIds.has(id));
  const sameNode = shuffled(available.filter((b) => b.nodeId === target.nodeId && !near.includes(b.id)), rng).map((b) => b.id);
  const others = shuffled(available.filter((b) => b.nodeId !== target.nodeId && !near.includes(b.id)), rng).map((b) => b.id);
  // Les briques déjà rencontrées passent d'abord. Les autres ne servent que s'il en manque.
  const ranked = [...near, ...sameNode, ...others];
  const ordered = [...ranked.filter(isKnown), ...ranked.filter((id) => !isKnown(id))];
  const size = type === 'E3' ? 2 : 3;
  // Deux sens identiques rendraient l'E3 injuste.
  const distractors = ordered
    .filter((id) => brick(content, id).fr[0] !== target.fr[0])
    .slice(0, size);
  return {
    type,
    brickId,
    options: shuffled([brickId, ...distractors], rng),
    targets: [brickId],
    voice: pickVoice(rng),
  };
}

const BE_FORMS = ['b.am', 'b.is', 'b.are'];
const NOT_FORMS = ['b.isnt', 'b.arent', 'b.not'];
const ARTICLES = ['b.a', 'b.an', 'b.the'];

/** Intruses d'un assemblage : formes voisines d'abord, pour tester la règle et non la mémoire visuelle. */
function intruders(s: Sentence, content: LessonContent, nodeId: string, rng: Rng, known?: ReadonlySet<string>): string[] {
  const reachable = bricksUpTo(content, nodeId, known);
  const available = new Set(reachable.filter((b) => !known || !b.tracked || known.has(b.id)).map((b) => b.id));
  const candidates: string[] = [];
  for (const id of s.bricks) {
    candidates.push(...brick(content, id).confusableWith);
    if (BE_FORMS.includes(id)) candidates.push(...BE_FORMS);
    if (NOT_FORMS.includes(id)) candidates.push(...NOT_FORMS);
    if (ARTICLES.includes(id)) candidates.push(...ARTICLES);
  }
  const unique = [...new Set(candidates)].filter((id) => available.has(id) && !s.bricks.includes(id));
  const fill = shuffled(reachable.filter((b) => b.tracked && available.has(b.id) && !s.bricks.includes(b.id) && !unique.includes(b.id)), rng).map((b) => b.id);
  return [...shuffled(unique, rng), ...fill].slice(0, s.bricks.length <= 2 ? 2 : 3);
}

export function assemblyExercise(
  type: 'E5' | 'E6',
  sentenceId: string,
  content: LessonContent,
  nodeId: string,
  rng: Rng,
  known?: ReadonlySet<string>,
): Exercise {
  const s = sentence(content, sentenceId);
  const all = [...s.bricks, ...intruders(s, content, nodeId, rng, known)];
  return {
    type,
    sentenceId,
    bank: shuffled(all.map((brickId, i) => ({ key: `${i}:${brickId}`, brickId })), rng),
    targets: sentenceTargets(s),
    voice: pickVoice(rng),
  };
}

export const sentenceTargets = (s: Sentence) => (s.formulaIds.length ? s.formulaIds.slice(0, 1) : s.bricks.slice(0, 1));

export function versionExercise(sentenceId: string, content: LessonContent, rng: Rng): Exercise {
  const s = sentence(content, sentenceId);
  const own = frenchTiles(s);
  const peers = content.sentences.filter(
    (o) => o.id !== s.id && isBeforeOrSame(content, o.minNodeId, s.minNodeId) && o.formulaIds[0] === s.formulaIds[0],
  );
  const extra = shuffled(peers.flatMap(frenchTiles).filter((w) => !own.includes(w)), rng);
  const intruderTiles = [...new Set(extra)].slice(0, 2);
  return {
    type: 'E7',
    sentenceId,
    tiles: shuffled([...own, ...intruderTiles].map((text, i) => ({ key: `${i}:${text}`, text })), rng),
    targets: sentenceTargets(s),
    voice: pickVoice(rng),
  };
}

export function themeExercise(sentenceId: string, content: LessonContent, rng: Rng): Exercise {
  return { type: 'E8', sentenceId, targets: sentenceTargets(sentence(content, sentenceId)), voice: pickVoice(rng) };
}

export function authoredExercise(id: string, content: LessonContent, rng: Rng): Exercise {
  const e = content.exercises.find((x) => x.id === id);
  if (!e) throw new Error(`Exercice inconnu : ${id}`);
  if (e.type === 'E10') {
    return { type: 'E10', authoredId: id, replacementOrder: shuffled(e.replacements.map((_, i) => i), rng), targets: e.targets, voice: pickVoice(rng) };
  }
  return { type: e.type, authoredId: id, optionOrder: shuffled(e.options.map((_, i) => i), rng), targets: e.targets, voice: pickVoice(rng) };
}

/** Sans son : les exercices d'écoute deviennent des exercices écrits (§2.6). */
export function adaptForSilence(ex: Exercise): Exercise {
  if (ex.type === 'E2') return { ...ex, type: 'E3', options: ex.options };
  if (ex.type === 'E6') return { ...ex, type: 'E5' };
  return ex;
}

/** Une autre forme, pour le retour d'un élément raté en fin de session. */
export function retryExercise(ex: Exercise, content: LessonContent, nodeId: string, rng: Rng, known?: ReadonlySet<string>): Exercise | null {
  switch (ex.type) {
    case 'E2':
      return brickExercise('E3', ex.brickId, content, nodeId, rng, known);
    case 'E3':
      return brickExercise('E4', ex.brickId, content, nodeId, rng, known);
    case 'E4':
      return brickExercise('E2', ex.brickId, content, nodeId, rng, known);
    case 'E5':
      return versionExercise(ex.sentenceId, content, rng);
    case 'E6':
      return assemblyExercise('E5', ex.sentenceId, content, nodeId, rng, known);
    case 'E7':
      return assemblyExercise('E5', ex.sentenceId, content, nodeId, rng, known);
    case 'E8':
      return assemblyExercise('E5', ex.sentenceId, content, nodeId, rng, known);
    case 'E9':
    case 'E10':
    case 'E11':
      return authoredExercise(ex.authoredId, content, rng);
  }
}

/** L'identifiant de ce que fait réviser un exercice, pour varier les phrases. */
export function exerciseRef(ex: Exercise): string {
  if ('sentenceId' in ex) return ex.sentenceId;
  if ('authoredId' in ex) return ex.authoredId;
  return ex.brickId;
}
