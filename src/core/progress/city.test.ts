import { city, lessonContent as content } from '../../content';
import { checkEnglish } from '../exercise/check';
import { createLessonState, composeLesson, currentStep, lessonReducer, type LessonState } from '../exercise/lesson';
import type { CheckResult, Exercise } from '../exercise/types';
import { beginPlan, enterStep, finishPlan, recordAnswer } from '../session/run';
import { composeExpedition, composePreparation, nextNode } from '../session/expedition';
import { createFsrsEngine } from '../srs/fsrsEngine';
import { newCard, reviewCard } from '../srs/memory';
import type { SrsEngine } from '../srs/types';
import { canEnter, cityOpen, districtEntry, isMastered, reuseRows, usageCount } from './city';
import { formulaEntries, nextObjective, trapEntries, wallGroups } from './collections';
import { allNodesDone, emptyProgress, nodeStatus, type ProgressSnapshot } from './progress';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 0, 10, 9);
const market = city.districts.find((d) => d.id === 'd.market')!;
const portNodes = content.tier.nodes.filter((n) => !n.districtId);

let engine: SrsEngine;
beforeAll(async () => {
  engine = await createFsrsEngine();
});

/** Un joueur qui a fini le Port : toutes ses cartes sont neuves, à la date donnée. */
function portFinished(at = NOW, beaten = true): ProgressSnapshot {
  const p = emptyProgress();
  for (const n of portNodes) if (n.kind !== 'boss' || beaten) p.nodes[n.id] = { status: 'completed', attempts: 1 };
  const portBricks = content.bricks.filter((b) => b.tracked && portNodes.some((n) => n.id === b.nodeId));
  for (const b of portBricks) {
    p.bricks[b.id] = { presentedAt: at, firstCorrectAt: at };
    p.cards[b.id] = reviewCard(newCard(b.id, engine, at), 'good', engine, at);
  }
  for (const f of ['f.be', 'f.not', 'f.q']) p.cards[f] = reviewCard(newCard(f, engine, at), 'good', engine, at);
  return p;
}

describe("entrée d'un quartier", () => {
  it('reste fermée tant que le Gardien n’est pas vaincu', () => {
    const p = portFinished(NOW, false);
    expect(cityOpen(content, p)).toBe(false);
    const entry = districtEntry(market, content, p, engine, NOW);
    expect(entry.status).toBe('needs_boss');
    expect(canEnter(entry)).toBe(false);
  });
  it('s’ouvre quand les fondamentaux sont maîtrisés', () => {
    const entry = districtEntry(market, content, portFinished(), engine, NOW);
    expect(entry.status).toBe('open');
    expect(entry.missing).toEqual([]);
  });
  it('demande de renforcer les briques usées, et elles seules', () => {
    const p = portFinished(NOW - 300 * DAY);
    p.cards['b.how'] = reviewCard(newCard('b.how', engine, NOW), 'good', engine, NOW);
    const entry = districtEntry(market, content, p, engine, NOW);
    expect(entry.status).toBe('needs_mastery');
    expect(entry.missing).toContain('b.this');
    expect(entry.missing).not.toContain('b.how');
    expect(isMastered('b.how', p, engine, NOW)).toBe(true);
  });
  it('fait réviser les briques à renforcer, ce qui ouvre le quartier', () => {
    const before = NOW - 300 * DAY;
    let p = portFinished(before);
    const { missing } = districtEntry(market, content, p, engine, NOW);
    expect(missing).toHaveLength(market.reuses.length);
    const plan = composePreparation(missing, { content, progress: p, engine, now: NOW, rng: Math.random });
    expect(plan.steps.length).toBe(missing.length);
    for (const id of missing) {
      p = { ...p, cards: { ...p.cards, [id]: reviewCard(p.cards[id], 'good', engine, NOW) } };
    }
    expect(districtEntry(market, content, p, engine, NOW).status).toBe('open');
  });
  it('ne se referme jamais une fois entré', () => {
    const p = portFinished(NOW - 300 * DAY);
    p.nodes['n.2.01'] = { status: 'in_progress', attempts: 1 };
    expect(districtEntry(market, content, p, engine, NOW).status).toBe('entered');
  });
  it('annonce à venir un quartier sans contenu', () => {
    const inn = city.districts.find((d) => d.id === 'd.inn')!;
    expect(districtEntry(inn, content, portFinished(), engine, NOW).status).toBe('soon');
  });
});

describe('fondamentaux réutilisés', () => {
  it('compte les phrases et classe les plus fréquents d’abord', () => {
    const rows = reuseRows(market, content, portFinished(), engine, NOW);
    expect(rows).toHaveLength(market.reuses.length);
    const counts = rows.map((r) => r.uses);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
    expect(usageCount(content, 'f.be')).toBeGreaterThan(usageCount(content, 'b.ten'));
    expect(rows.every((r) => r.uses >= 2)).toBe(true);
  });
  it('montre chaque élément dans une phrase du Port puis du quartier', () => {
    for (const r of reuseRows(market, content, portFinished(), engine, NOW)) {
      expect(portNodes.some((n) => n.id === r.before.minNodeId)).toBe(true);
      expect(market.nodes.some((n) => n.id === r.after.minNodeId)).toBe(true);
    }
  });
});

describe('le Port ne change pas', () => {
  it('la fin du Port ne dépend pas des quartiers', () => {
    expect(allNodesDone(content.tier, portFinished())).toBe(true);
  });
  it('ne dévoile pas le Marché dans les collections avant la visite', () => {
    const p = portFinished();
    expect(wallGroups(content, p, engine, NOW)).toHaveLength(9);
    expect(trapEntries(content, p)).toHaveLength(16);
    expect(formulaEntries(content, p)).toHaveLength(3);
    p.nodes['n.2.01'] = { status: 'in_progress', attempts: 1 };
    expect(wallGroups(content, p, engine, NOW).length).toBeGreaterThan(9);
    expect(trapEntries(content, p).length).toBeGreaterThan(16);
    expect(formulaEntries(content, p)).toHaveLength(4);
  });
  it('n’avance pas seul vers un quartier : c’est au joueur de choisir', () => {
    const p = portFinished();
    expect(nextNode(content, p)).toBeUndefined();
    expect(composeExpedition({ content, progress: p, engine, now: NOW + 3 * DAY, rng: () => 0.3 }).nodeId).toBeNull();
    expect(nextObjective(content, p, engine, NOW)).toContain('Ville');
  });
  it('continue le quartier choisi depuis une Expédition', () => {
    const p = portFinished();
    p.nodes['n.2.01'] = { status: 'in_progress', attempts: 1 };
    expect(nextNode(content, p)?.id).toBe('n.2.01');
    expect(nodeStatus(content.tier, p, content.tier.nodes.find((n) => n.id === 'n.2.02')!)).toBe('locked');
  });
});

/** Répond juste à chaque étape, en passant par les vrais calculs de la session. */
function playToTheEnd(start: ProgressSnapshot, nodeId: string, now: number): { p: ProgressSnapshot; state: LessonState } {
  const node = content.tier.nodes.find((n) => n.id === nodeId)!;
  const plan = composeLesson(node, content, start, Math.random);
  let p = beginPlan(start, plan);
  let state = createLessonState(plan);
  const seen = new Set<string>();
  const correct: CheckResult = { correct: true, almost: false, expected: '', given: '', diff: [], blame: [], pourquoi: '', aRetenir: '' };
  for (let guard = 0; guard < 200 && state.stage !== 'done' && state.stage !== 'trial_failed'; guard++) {
    const step = currentStep(state);
    p = enterStep(p, step, engine, now).next;
    if (step?.kind === 'exercise' && state.stage === 'step') {
      state = lessonReducer(state, { type: 'ANSWER', result: correct });
      p = recordAnswer(p, state.answers[state.answers.length - 1], seen, null, engine, now).next;
    } else {
      state = lessonReducer(state, { type: 'NEXT' });
    }
  }
  return { p: finishPlan(p, state, content, now), state };
}

/** Le joueur ne voit jamais une brique qu'il n'a pas rencontrée, sauf si le contenu l'exige. */
function tilesOf(ex: Exercise): string[] {
  if (ex.type === 'E5' || ex.type === 'E6') return ex.bank.map((b) => b.brickId);
  if (ex.type === 'E2' || ex.type === 'E3' || ex.type === 'E4') return ex.options;
  return [];
}

describe('le Marché se joue de bout en bout', () => {
  it('termine ses quatre nœuds, en réutilisant le Port', () => {
    let p = portFinished();
    expect(p.cards['b.apple']).toBeUndefined();
    let t = NOW;
    for (const n of market.nodes) {
      for (let attempt = 0; attempt < 4 && p.nodes[n.id]?.status !== 'completed'; attempt++) {
        t += 3_600_000;
        p = playToTheEnd(p, n.id, t).p;
      }
      expect(p.nodes[n.id]?.status).toBe('completed');
    }
    expect(p.cards['f.plural']).toBeDefined();
    for (const id of market.nodes.flatMap((n) => n.brickIds ?? [])) expect(p.cards[id]).toBeDefined();
    expect(districtEntry(market, content, p, engine, t).status).toBe('done');

    // Ses éléments entrent dans les révisions du jeu.
    const later = composeExpedition({ content, progress: p, engine, now: t + 2 * DAY, rng: Math.random });
    expect(later.steps.length).toBeGreaterThan(0);
  });

  it('ne propose pas de briques d’un autre quartier dans ses exercices', () => {
    const node = market.nodes[0];
    const plan = composeLesson({ ...node, districtId: market.id }, content, portFinished(), Math.random);
    const marketIds = new Set(content.bricks.filter((b) => market.nodes.some((n) => n.id === b.nodeId)).map((b) => b.id));
    const later = market.nodes.slice(1).flatMap((n) => n.brickIds ?? []);
    for (const s of plan.steps) {
      if (s.kind !== 'exercise') continue;
      for (const id of tilesOf(s.exercise)) {
        if (marketIds.has(id)) expect(later).not.toContain(id);
      }
    }
  });

  it('corrige une phrase du Marché comme les autres', () => {
    const s = content.sentences.find((x) => x.id === 's.m10')!;
    expect(checkEnglish(s, 'How much is this?', content, false).correct).toBe(true);
    expect(checkEnglish(s, 'How much this is?', content, false).correct).toBe(false);
  });
});
