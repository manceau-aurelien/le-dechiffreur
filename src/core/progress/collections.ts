// Ce que le joueur voit de ses acquis : Stèle, Mur, Carnet, prochain objectif. Fonctions pures.
import type { Brick, Formula, Trap, TierNode } from '../../content/schema';
import { nodeIndex } from '../exercise/generate';
import type { LessonContent } from '../exercise/types';
import { bossLock, computeSocle, doorAdvice, SOCLE_FOR_NEW_NODE, wearOf, type Wear } from '../srs/memory';
import type { SrsEngine } from '../srs/types';
import { allNodesDone, cardList, type ProgressSnapshot } from './progress';

const DAY_MS = 86_400_000;
export const COMEBACK_DAYS = 14;

// --- Stèle ---

export interface SteleWord {
  key: string;
  word: string; // tel qu'écrit, sans sa ponctuation
  trailing: string; // ponctuation à sa suite
  brickId: string;
  known: boolean;
}

/** Un mot de la Stèle est lisible si sa brique est acquise, ou si la formule qui la porte est descellée (§5.2). */
export function isReadable(b: Brick, p: ProgressSnapshot, signatureId?: string): boolean {
  if (b.id === signatureId) return true;
  if (b.tracked) return !!p.cards[b.id];
  return !!b.ownerFormula && !!p.cards[b.ownerFormula];
}

const SIGNATURE_ID = 'b.anna'; // Le nom d'Anna se lit dès le début, comme une signature.

/** Découpe le texte en mots. « Thank you » est une seule brique. */
export function steleWords(text: string, bricks: Brick[], p: ProgressSnapshot): SteleWord[] {
  const byText = new Map(bricks.map((b) => [b.en.toLowerCase(), b]));
  const raw = text.split(/\s+/);
  const out: SteleWord[] = [];
  for (let i = 0; i < raw.length; i++) {
    const match = /^(.*?)([.,?!]*)$/.exec(raw[i])!;
    let word = match[1];
    let trailing = match[2];
    if (word.toLowerCase() === 'thank' && raw[i + 1]) {
      const next = /^(.*?)([.,?!]*)$/.exec(raw[i + 1])!;
      word = `${word} ${next[1]}`;
      trailing = next[2];
      i++;
    }
    const b = byText.get(word.toLowerCase());
    if (!b) throw new Error(`Mot de la Stèle sans brique : ${word}`);
    out.push({ key: `${out.length}:${b.id}`, word, trailing, brickId: b.id, known: isReadable(b, p, SIGNATURE_ID) });
  }
  return out;
}

export function steleProgress(words: SteleWord[]) {
  const known = words.filter((w) => w.known).length;
  return { known, total: words.length, complete: known === words.length };
}

// Des lettres grecques et cyrilliques : présentes sur tous les téléphones, illisibles pour un francophone.
const GLYPHS = 'ΔΞΨΩΠΣΦΛЖЮЯЭБГДИЛЦЧШЩЪ';

/** Des runes de même longueur que le mot, toujours les mêmes pour une même lettre. */
export function toRunes(word: string): string {
  return [...word].map((c) => (/\s/.test(c) ? c : GLYPHS[c.toLowerCase().charCodeAt(0) % GLYPHS.length])).join('');
}

// --- Mur ---

export interface WallBrick {
  brick: Brick;
  acquired: boolean;
  r: number | null;
  wear: Wear | null;
}

export interface WallGroup {
  node: TierNode;
  bricks: WallBrick[];
}

export function wallGroups(content: LessonContent, p: ProgressSnapshot, engine: SrsEngine, now: number): WallGroup[] {
  return content.tier.nodes
    .filter((n) => n.kind === 'vein')
    .map((node) => ({
      node,
      bricks: (node.brickIds ?? []).map((id) => {
        const brick = content.bricks.find((b) => b.id === id)!;
        const card = p.cards[id];
        if (!card) return { brick, acquired: false, r: null, wear: null };
        const r = engine.retrievability(card.state, now);
        return { brick, acquired: true, r, wear: wearOf(r) };
      }),
    }));
}

/** Les briques usées, les plus abîmées d'abord. */
export function wornBricks(groups: WallGroup[]): WallBrick[] {
  return groups
    .flatMap((g) => g.bricks)
    .filter((b) => b.acquired && b.wear !== 'neuve')
    .sort((a, b) => (a.r ?? 0) - (b.r ?? 0));
}

/** Une phrase d'exemple que le joueur peut comprendre : ses briques et ses formules sont acquises. */
export function exampleFor(brickId: string, content: LessonContent, p: ProgressSnapshot) {
  return content.sentences.find((s) => {
    if (!s.bricks.includes(brickId)) return false;
    if (!s.formulaIds.every((f) => p.cards[f])) return false;
    return s.bricks.every((id) => {
      const b = content.bricks.find((x) => x.id === id)!;
      return b.tracked ? !!p.cards[id] : !b.ownerFormula || !!p.cards[b.ownerFormula];
    });
  });
}

// --- Carnet ---

export interface FormulaEntry {
  formula: Formula;
  unsealed: boolean;
}

export const formulaEntries = (c: LessonContent, p: ProgressSnapshot): FormulaEntry[] =>
  c.formulas.map((formula) => ({ formula, unsealed: !!p.cards[formula.id] }));

export interface TrapEntry {
  trap: Trap;
  met: boolean;
}

export const trapEntries = (c: LessonContent, p: ProgressSnapshot): TrapEntry[] => c.traps.map((trap) => ({ trap, met: !!p.cards[trap.id] }));

/** Les notes d'Anna déjà découvertes : celles des nœuds commencés, dans l'ordre de la carte. */
export function annaNotes(c: LessonContent, p: ProgressSnapshot): { key: string; text: string }[] {
  return c.tier.nodes.filter((n) => n.intro && p.nodes[n.id]).map((n) => ({ key: n.id, text: n.intro! }));
}

// --- Camp ---

/** Le prochain objectif, en une ligne. */
export function nextObjective(c: LessonContent, p: ProgressSnapshot, engine: SrsEngine, now: number): string {
  const bossNode = c.tier.nodes.find((n) => n.kind === 'boss');
  if (bossNode && p.nodes[bossNode.id]?.status === 'completed') return 'La Porte est ouverte. La bibliothèque t’attend.';
  const cards = cardList(p);
  const socle = computeSocle(cards, engine, now);
  if (allNodesDone(c.tier, p)) {
    if (p.bossOpened) return 'La Porte s’offre à toi. Le Gardien t’attend.';
    return doorAdvice(bossLock(cards, true, engine, now));
  }
  if (!p.devUnlockAll && socle < SOCLE_FOR_NEW_NODE) return 'Entretiens tes briques : le socle doit remonter à 70 %.';
  const next = c.tier.nodes
    .filter((n) => n.kind !== 'boss' && p.nodes[n.id]?.status !== 'completed')
    .sort((a, b) => nodeIndex(c, a.id) - nodeIndex(c, b.id))[0];
  return next.kind === 'formula' ? `Formule à prouver : ${next.title}.` : `Prochain filon : ${next.title}.`;
}

/** Le joueur revient-il après une longue absence ? Aucun reproche, juste un mot d'accueil (§2.6). */
export function isComeback(p: ProgressSnapshot, now: number): boolean {
  const cards = cardList(p);
  if (!cards.length) return false;
  const last = Math.max(...cards.map((c) => c.lastReviewAt));
  return now - last > COMEBACK_DAYS * DAY_MS;
}

/** Un joueur déjà engagé n'a pas à revoir le premier lancement. */
export const needsOnboarding = (p: ProgressSnapshot) => !p.onboarded && !Object.keys(p.bricks).length;
