import { lessonContent as content } from '../../content';
import { createFsrsEngine } from '../srs/fsrsEngine';
import { newCard, reviewCard } from '../srs/memory';
import type { SrsEngine } from '../srs/types';
import {
  annaNotes,
  exampleFor,
  formulaEntries,
  isComeback,
  needsOnboarding,
  nextObjective,
  steleProgress,
  steleWords,
  toRunes,
  trapEntries,
  wallGroups,
  wornBricks,
} from './collections';
import { emptyProgress, type ProgressSnapshot } from './progress';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 0, 10, 9);
const stele = content.tier.stele.en;
const trackedIds = content.bricks.filter((b) => b.tracked).map((b) => b.id);

let engine: SrsEngine;
beforeAll(async () => {
  engine = await createFsrsEngine();
});

function withCards(ids: string[], daysAgo = 0): ProgressSnapshot {
  const p = emptyProgress();
  for (const id of ids) {
    const at = NOW - daysAgo * DAY;
    p.cards[id] = reviewCard(newCard(id, engine, at), 'good', engine, at);
    if (id.startsWith('b.')) p.bricks[id] = { presentedAt: at, firstCorrectAt: at };
  }
  return p;
}
const finished = (p: ProgressSnapshot, count: number) => {
  content.tier.nodes.slice(0, count).forEach((n) => (p.nodes[n.id] = { status: 'completed', attempts: 1 }));
  return p;
};

describe('Stèle', () => {
  it('ne laisse lire que le nom d\'Anna au début', () => {
    const words = steleWords(stele, content.bricks, emptyProgress());
    expect(words.filter((w) => w.known).map((w) => w.word)).toEqual(['Anna']);
    expect(steleProgress(words).complete).toBe(false);
  });
  it('traite « Thank you » comme une seule brique et garde la ponctuation', () => {
    const words = steleWords(stele, content.bricks, emptyProgress());
    const thanks = words.find((w) => w.brickId === 'b.thank-you')!;
    expect(thanks.word).toBe('Thank you');
    expect(thanks.trailing).toBe(',');
    expect(words[0]).toMatchObject({ word: 'Hello', trailing: '.' });
    const rebuilt = words.map((w) => w.word + w.trailing).join(' ');
    expect(rebuilt).toBe(stele);
  });
  it('démasque une brique acquise, partout où elle apparaît', () => {
    const words = steleWords(stele, content.bricks, withCards(['b.i']));
    const mine = words.filter((w) => w.word === 'I');
    expect(mine.length).toBeGreaterThan(1);
    expect(mine.every((w) => w.known)).toBe(true);
  });
  it('démasque un outil quand sa formule est descellée', () => {
    expect(steleWords(stele, content.bricks, emptyProgress()).find((w) => w.word === 'is')!.known).toBe(false);
    expect(steleWords(stele, content.bricks, withCards(['f.be'])).find((w) => w.word === 'is')!.known).toBe(true);
    expect(steleWords(stele, content.bricks, withCards(['f.be'])).find((w) => w.word === 'isn\'t')!.known).toBe(false);
  });
  it('se lit en entier quand tout est acquis', () => {
    const words = steleWords(stele, content.bricks, withCards([...trackedIds, 'f.be', 'f.not', 'f.q']));
    expect(steleProgress(words)).toMatchObject({ complete: true, known: words.length });
  });
  it('remplace un mot par des runes de même longueur, stables', () => {
    expect([...toRunes('sailor')]).toHaveLength(6);
    expect(toRunes('sailor')).toBe(toRunes('sailor'));
    expect(toRunes('sailor')).not.toContain('s');
    expect(toRunes('Thank you')).toContain(' ');
  });
});

describe('Mur', () => {
  it('range les 53 briques par filon', () => {
    const groups = wallGroups(content, emptyProgress(), engine, NOW);
    expect(groups).toHaveLength(9);
    expect(groups.flatMap((g) => g.bricks)).toHaveLength(53);
    expect(groups.flatMap((g) => g.bricks).every((b) => !b.acquired && b.wear === null)).toBe(true);
  });
  it('montre l\'usure et classe les briques les plus abîmées d\'abord', () => {
    const p = withCards(['b.he'], 0);
    p.cards['b.she'] = reviewCard(newCard('b.she', engine, NOW - 300 * DAY), 'good', engine, NOW - 300 * DAY);
    p.cards['b.we'] = reviewCard(newCard('b.we', engine, NOW - 10 * DAY), 'good', engine, NOW - 10 * DAY);
    const groups = wallGroups(content, p, engine, NOW);
    const all = groups.flatMap((g) => g.bricks);
    expect(all.find((b) => b.brick.id === 'b.he')?.wear).toBe('neuve');
    expect(all.find((b) => b.brick.id === 'b.she')?.wear).toBe('effritee');
    expect(wornBricks(groups).map((b) => b.brick.id)).toEqual(['b.she', 'b.we']);
  });
  it('choisit un exemple compréhensible, ou aucun', () => {
    expect(exampleFor('b.he', content, withCards(['b.he']))).toBeUndefined();
    const p = withCards(['b.he', 'b.sailor', 'f.be']);
    expect(exampleFor('b.he', content, p)?.en).toBe('He is a sailor.');
  });
});

describe('Carnet', () => {
  it('garde scellées les formules non prouvées', () => {
    const entries = formulaEntries(content, withCards(['f.be']));
    expect(entries.map((e) => e.unsealed)).toEqual([true, false, false]);
  });
  it('liste les 16 pièges, rencontrés ou non', () => {
    const entries = trapEntries(content, withCards(['t.07']));
    expect(entries).toHaveLength(16);
    expect(entries.filter((e) => e.met).map((e) => e.trap.id)).toEqual(['t.07']);
  });
  it('ne révèle que les notes des nœuds commencés', () => {
    expect(annaNotes(content, emptyProgress())).toEqual([]);
    const p = finished(emptyProgress(), 1);
    expect(annaNotes(content, p).map((n) => n.key)).toEqual(['n.1.01']);
  });
});

describe('Camp', () => {
  it('annonce le prochain filon, puis la formule', () => {
    expect(nextObjective(content, emptyProgress(), engine, NOW)).toBe('Prochain filon : Première rencontre.');
    expect(nextObjective(content, finished(emptyProgress(), 4), engine, NOW)).toBe("Formule à prouver : La Formule d'Être.");
  });
  it('demande de l\'entretien sous 70 % de socle', () => {
    expect(nextObjective(content, withCards(['b.he'], 300), engine, NOW)).toContain('Entretiens');
  });
  it('accompagne vers la Porte, puis la bibliothèque', () => {
    const p = finished(withCards(trackedIds), 12);
    expect(nextObjective(content, p, engine, NOW)).toContain('Consolide');
    expect(nextObjective(content, { ...p, bossOpened: true }, engine, NOW)).toContain('Gardien');
    const won = finished(withCards(trackedIds), 13);
    expect(nextObjective(content, won, engine, NOW)).toContain('bibliothèque');
  });
  it('accueille après une longue absence, jamais avant', () => {
    expect(isComeback(emptyProgress(), NOW)).toBe(false);
    expect(isComeback(withCards(['b.he'], 3), NOW)).toBe(false);
    expect(isComeback(withCards(['b.he'], 20), NOW)).toBe(true);
  });
  it('ne montre le premier lancement qu\'une fois, et jamais à un joueur déjà engagé', () => {
    expect(needsOnboarding(emptyProgress())).toBe(true);
    expect(needsOnboarding({ ...emptyProgress(), onboarded: true })).toBe(false);
    expect(needsOnboarding(withCards(['b.he']))).toBe(false);
  });
});
