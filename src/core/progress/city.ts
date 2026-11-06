// La Ville : ce qu'il faut maîtriser pour entrer dans un quartier, et ce qu'on y réutilise. Fonctions pures.
import type { District, Reuse, Sentence } from '../../content/schema';
import type { LessonContent } from '../exercise/types';
import type { SrsEngine } from '../srs/types';
import type { ProgressSnapshot } from './progress';

/** Le même seuil que le socle : une brique tient si sa mémoire estimée est d'au moins 70 %. */
export const MASTERY_R = 0.7;

export const bossBeaten = (c: LessonContent, p: ProgressSnapshot) => {
  const boss = c.tier.nodes.find((n) => n.kind === 'boss');
  return !!boss && p.nodes[boss.id]?.status === 'completed';
};

export const cityOpen = (c: LessonContent, p: ProgressSnapshot) => p.devUnlockAll || bossBeaten(c, p);

export function isMastered(id: string, p: ProgressSnapshot, engine: SrsEngine, now: number): boolean {
  const card = p.cards[id];
  return !!card && engine.retrievability(card.state, now) >= MASTERY_R;
}

/** Dans combien de phrases du jeu cet élément revient : c'est ce qui en fait un fondamental. */
export function usageCount(c: LessonContent, id: string): number {
  return c.sentences.filter((s) => (id.startsWith('b.') ? s.bricks.includes(id) : s.formulaIds.includes(id))).length;
}

export interface ReuseRow extends Reuse {
  title: string; // le nom à afficher : le mot pour une brique, le titre pour une formule
  before: Sentence;
  after: Sentence;
  uses: number;
  mastered: boolean;
}

/** Les fondamentaux réutilisés, ceux qui reviennent le plus souvent d'abord. */
export function reuseRows(district: District, c: LessonContent, p: ProgressSnapshot, engine: SrsEngine, now: number): ReuseRow[] {
  const sentence = (id: string) => c.sentences.find((s) => s.id === id)!;
  return district.reuses
    .map((r) => ({
      ...r,
      title: c.formulas.find((f) => f.id === r.element)?.title ?? c.bricks.find((b) => b.id === r.element)!.en,
      before: sentence(r.beforeSentenceId),
      after: sentence(r.afterSentenceId),
      uses: usageCount(c, r.element),
      mastered: isMastered(r.element, p, engine, now),
    }))
    .sort((a, b) => b.uses - a.uses);
}

export type DistrictStatus = 'soon' | 'needs_boss' | 'needs_mastery' | 'open' | 'entered' | 'done';

export interface DistrictEntry {
  status: DistrictStatus;
  missing: string[]; // les fondamentaux à renforcer avant d'entrer
  nodesDone: number;
  nodesTotal: number;
}

/** Une fois entré, un quartier ne se referme jamais : rien de ce qui est acquis ne se perd (§2.4). */
export function districtEntry(district: District, c: LessonContent, p: ProgressSnapshot, engine: SrsEngine, now: number): DistrictEntry {
  const nodesDone = district.nodes.filter((n) => p.nodes[n.id]?.status === 'completed').length;
  const base = { nodesDone, nodesTotal: district.nodes.length };
  const missing = district.reuses.map((r) => r.element).filter((id) => !isMastered(id, p, engine, now));
  if (!district.nodes.length) return { status: 'soon', missing: [], ...base };
  if (nodesDone === district.nodes.length) return { status: 'done', missing: [], ...base };
  if (district.nodes.some((n) => p.nodes[n.id])) return { status: 'entered', missing: [], ...base };
  if (p.devUnlockAll) return { status: 'open', missing: [], ...base };
  if (!bossBeaten(c, p)) return { status: 'needs_boss', missing, ...base };
  return { status: missing.length ? 'needs_mastery' : 'open', missing, ...base };
}

export const canEnter = (e: DistrictEntry) => e.status === 'open' || e.status === 'entered' || e.status === 'done';
