import { boss as bossContent, lessonContent as content } from '../../content';
import { bossReducer, createBossState, currentRound, drawBossVariants, type BossState } from '../boss/engine';
import { applyBossResults, blamedElements } from '../boss/review';
import { createLessonState, currentStep, estimateSeconds, lessonReducer, type LessonPlan } from '../exercise/lesson';
import type { CheckResult, Exercise, Rng } from '../exercise/types';
import { allNodesDone, cardList, emptyProgress, refreshBossDoor, type ProgressSnapshot } from '../progress/progress';
import { createFsrsEngine } from '../srs/fsrsEngine';
import { bossLock, capDue, computeSocle, consolidatedShare, dayKey, isDue, needsListening, newCard, priorityOf, ratingFor, reviewCard, wearOf } from '../srs/memory';
import type { SrsEngine } from '../srs/types';
import { brickExercise } from '../exercise/generate';
import { BUDGET_SECONDS, canStartNew, composeExpedition, composePreparation, ensureListening, exerciseForCard, hasUsefulWork, interleave, MAX_REVIEWS, nextNode, pendingTraps, varyForms } from './expedition';
import { beginPlan, enterStep, finishPlan, recordAnswer } from './run';

const DAY = 86_400_000;
const START = Date.UTC(2026, 0, 5, 9);
const seeded = (seed: number): Rng => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const ok = (given = ''): CheckResult => ({ correct: true, almost: false, expected: '', given, diff: [], blame: [], pourquoi: '', aRetenir: '' });
const ko = (blame: string[]): CheckResult => ({ ...ok(), correct: false, blame, pourquoi: 'p', aRetenir: 'r' });

let engine: SrsEngine;
beforeAll(async () => {
  engine = await createFsrsEngine();
});

const cardAt = (id: string, days: number, now = START) => reviewCard(newCard(id, engine, now - days * DAY), 'good', engine, now - days * DAY);

describe('moteur FSRS', () => {
  it('fait baisser R avec le temps et allonge la stabilité après une bonne réponse', () => {
    const c0 = reviewCard(newCard('b.he', engine, START), 'good', engine, START);
    const r1 = engine.retrievability(c0.state, START + DAY);
    const r10 = engine.retrievability(c0.state, START + 10 * DAY);
    expect(r1).toBeGreaterThan(r10);
    expect(engine.retrievability(c0.state, START)).toBeCloseTo(1, 3);
    const c1 = reviewCard(c0, 'good', engine, START + 3 * DAY);
    expect(c1.stability).toBeGreaterThan(c0.stability);
  });
  it('raccourcit la stabilité après une erreur', () => {
    let c = reviewCard(newCard('b.he', engine, START), 'good', engine, START);
    c = reviewCard(c, 'good', engine, START + 3 * DAY);
    const failed = reviewCard(c, 'again', engine, START + 10 * DAY);
    expect(failed.stability).toBeLessThan(c.stability);
    expect(failed.lastWrong).toBe(true);
    expect(failed.lapses).toBe(1);
  });
  it('survit à un aller-retour en JSON', () => {
    const c = reviewCard(newCard('b.he', engine, START), 'good', engine, START);
    const back = JSON.parse(JSON.stringify(c));
    expect(engine.retrievability(back.state, START + DAY)).toBeCloseTo(engine.retrievability(c.state, START + DAY), 6);
    expect(reviewCard(back, 'good', engine, START + 2 * DAY).reps).toBe(2);
  });
});

describe('règles de mémoire', () => {
  it('note selon la réponse et les écoutes', () => {
    expect(ratingFor({ correct: false, almost: false }, 0, false)).toBe('again');
    expect(ratingFor({ correct: true, almost: true }, 0, false)).toBe('hard');
    expect(ratingFor({ correct: true, almost: false }, 2, true)).toBe('hard');
    expect(ratingFor({ correct: true, almost: false }, 1, true)).toBe('good');
    expect(ratingFor({ correct: true, almost: false }, 2, false)).toBe('good');
  });
  it('bride les deux premières révisions', () => {
    const far = START + 30 * DAY;
    expect(capDue(far, 1, START)).toBe(START + DAY);
    expect(capDue(far, 2, START)).toBe(START + 3 * DAY);
    expect(capDue(far, 3, START)).toBe(far);
    const c = reviewCard(newCard('b.he', engine, START), 'good', engine, START);
    expect(c.dueAt).toBeLessThanOrEqual(START + DAY);
  });
  it('compte les jours de réussite distincts', () => {
    let c = reviewCard(newCard('b.he', engine, START), 'good', engine, START);
    expect(c.distinctSuccessDays).toBe(1);
    c = reviewCard(c, 'good', engine, START + 3_600_000);
    expect(c.distinctSuccessDays).toBe(1);
    c = reviewCard(c, 'again', engine, START + 2 * DAY);
    expect(c.distinctSuccessDays).toBe(1);
    c = reviewCard(c, 'good', engine, START + 3 * DAY);
    expect(c.distinctSuccessDays).toBe(2);
    expect(dayKey(START + 3 * DAY)).toBe(dayKey(START) + 3);
  });
  it('traduit R en usure', () => {
    expect(wearOf(0.95)).toBe('neuve');
    expect(wearOf(0.85)).toBe('patinee');
    expect(wearOf(0.7)).toBe('fissuree');
    expect(wearOf(0.4)).toBe('effritee');
  });
  it('rend due une carte oubliée ou arrivée à échéance', () => {
    const c = cardAt('b.he', 0);
    expect(isDue(c, 0.99, START)).toBe(false);
    expect(isDue(c, 0.99, c.dueAt)).toBe(true);
    expect(isDue(c, 0.8, START)).toBe(true);
  });
  it('donne plus de priorité à une carte ratée', () => {
    const c = cardAt('b.he', 0);
    expect(priorityOf({ ...c, lastWrong: true }, 0.8)).toBeCloseTo(priorityOf(c, 0.8) * 1.5);
  });
  it('calcule le socle, 100 % sans carte', () => {
    expect(computeSocle([], engine, START)).toBe(1);
    const fresh = cardAt('b.he', 0);
    const old = cardAt('b.she', 400);
    expect(computeSocle([fresh, old], engine, START)).toBe(0.5);
  });
  it('détecte une oreille en retard', () => {
    const c = cardAt('b.he', 0);
    expect(needsListening({ ...c, listenOk: 1, listenTotal: 2 })).toBe(false);
    expect(needsListening({ ...c, listenOk: 2, listenTotal: 3 })).toBe(true);
    expect(needsListening({ ...c, listenOk: 3, listenTotal: 3 })).toBe(false);
  });
});

function withCards(ids: string[], days: number, extra: Partial<ProgressSnapshot> = {}): ProgressSnapshot {
  const p = emptyProgress();
  for (const id of ids) {
    p.cards[id] = cardAt(id, days);
    if (id.startsWith('b.')) p.bricks[id] = { presentedAt: START - days * DAY, firstCorrectAt: START - days * DAY };
  }
  return { ...p, ...extra };
}
const finished = (p: ProgressSnapshot, upTo: number) => {
  const nodes = { ...p.nodes };
  content.tier.nodes.slice(0, upTo).forEach((n) => (nodes[n.id] = { status: 'completed', attempts: 1 }));
  return { ...p, nodes };
};
const allBrickIds = content.bricks.filter((b) => b.tracked).map((b) => b.id);
const ctxOf = (progress: ProgressSnapshot, now = START, seed = 1) => ({ content, progress, engine, now, rng: seeded(seed) });
const exercisesOf = (plan: LessonPlan) => plan.steps.flatMap((s) => (s.kind === 'exercise' ? [s.exercise] : []));

describe('composition d\'une Expédition', () => {
  it('commence par du contenu neuf quand rien n\'est dû', () => {
    const plan = composeExpedition(ctxOf(emptyProgress()));
    expect(plan.nodeId).toBe('n.1.01');
    expect(plan.steps.some((s) => s.kind === 'present')).toBe(true);
  });
  it('reste dans le budget, avec au plus 15 révisions, même après une longue absence', () => {
    for (let seed = 1; seed < 8; seed++) {
      const p = finished(withCards(allBrickIds, 200), 12);
      const plan = composeExpedition(ctxOf(p, START, seed));
      const reviews = exercisesOf(plan);
      expect(reviews.length).toBeLessThanOrEqual(MAX_REVIEWS + 1);
      expect(estimateSeconds(plan.steps)).toBeLessThanOrEqual(BUDGET_SECONDS + 25);
      expect(plan.steps.some((s) => s.kind === 'present')).toBe(false);
    }
  });
  it('bloque le contenu neuf sous 70 % de socle', () => {
    const p = finished(withCards(allBrickIds.slice(0, 25), 300), 4);
    expect(canStartNew(ctxOf(p))).toBe(false);
    const plan = composeExpedition(ctxOf(p));
    expect(plan.nodeId).toBeNull();
    expect(plan.steps.some((s) => s.kind === 'present' || s.kind === 'clue')).toBe(false);
  });
  it('le mode développeur ignore le verrou', () => {
    const p = finished(withCards(allBrickIds.slice(0, 25), 300, { devUnlockAll: true }), 4);
    expect(composeExpedition(ctxOf(p)).nodeId).toBe('n.1.05');
  });
  it('fait passer les cartes les plus usées d\'abord', () => {
    const p = withCards(allBrickIds.slice(0, 20), 1);
    const worn = 'b.friend';
    p.cards[worn] = cardAt(worn, 300);
    const plan = composeExpedition({ ...ctxOf(p), budgetSeconds: 25 });
    const exs = exercisesOf(plan);
    expect(exs.some((e) => e.targets.includes(worn))).toBe(true);
  });
  it("rattrape les pièges d'un nœud terminé", () => {
    const p = finished(withCards(allBrickIds.slice(0, 30), 0), 6);
    expect(pendingTraps(content, p)).toEqual(['t.01', 't.02', 't.03', 't.04', 't.05', 't.06']);
    const plan = composeExpedition(ctxOf(p));
    expect(exercisesOf(plan).filter((e) => e.type === 'E9').length).toBeGreaterThanOrEqual(3);
    const allDone = finished(withCards(allBrickIds, 0), 12);
    for (const id of allBrickIds) allDone.cards[id] = { ...allDone.cards[id], dueAt: START + 1000 * DAY };
    expect(hasUsefulWork({ content, progress: allDone, engine, now: START })).toBe(true);
  });
  it('limite une formule à 3 révisions avant l\'épreuve', () => {
    const p = finished(withCards(allBrickIds.slice(0, 25), 5), 4);
    const plan = composeExpedition(ctxOf(p));
    expect(plan.nodeId).toBe('n.1.05');
    const firstClue = plan.steps.findIndex((s) => s.kind === 'clue');
    expect(firstClue).toBeLessThanOrEqual(4);
    expect(plan.passMin).toBe(5);
  });
  it('varie les types d\'exercices et garde une écoute par tranche de 4', () => {
    const p = finished(withCards([...allBrickIds, 'f.be', 'f.not', 'f.q'], 15), 12);
    for (let seed = 1; seed < 6; seed++) {
      const exs = exercisesOf(composeExpedition(ctxOf(p, START, seed)));
      for (let i = 0; i + 4 <= exs.length - 1; i += 4) {
        expect(exs.slice(i, i + 4).some((e) => ['E2', 'E6', 'E11'].includes(e.type))).toBe(true);
      }
    }
  });
  it('évite deux exercices de même code à la suite', () => {
    const mk = (type: Exercise['type']) => ({ type } as Exercise);
    const out = interleave([mk('E2'), mk('E2'), mk('E4'), mk('E4')]).map((e) => e.type);
    for (let i = 1; i < out.length; i++) expect(out[i]).not.toBe(out[i - 1]);
  });
  it('change la forme de deux rappels identiques à la suite', () => {
    const p = withCards(allBrickIds.slice(0, 10), 1);
    const ctx = ctxOf(p);
    const same = allBrickIds.slice(0, 5).map((id) => brickExercise('E4', id, content, 'n.1.03', ctx.rng));
    const out = varyForms(same, ctx).map((e) => e.type);
    for (let i = 1; i < out.length; i++) expect(out[i]).not.toBe(out[i - 1]);
  });
  it('transforme un rappel écrit en écoute si la tranche n\'en a pas', () => {
    const p = withCards(allBrickIds.slice(0, 10), 1);
    const ctx = ctxOf(p);
    const fours = allBrickIds.slice(0, 4).map((id) => exerciseForCard({ ...p.cards[id], stability: 6 }, ctx)!);
    const forced = ensureListening(fours.map((e) => ({ ...e, type: 'E4', brickId: 'b.he', options: ['b.he'] } as Exercise)), ctx);
    expect(forced.some((e) => e.type === 'E2')).toBe(true);
  });
  it('ne propose rien qui ne soit acquis', () => {
    const ids = allBrickIds.slice(0, 13);
    const p = finished(withCards(ids, 10), 2);
    for (let seed = 1; seed < 12; seed++) {
      for (const e of exercisesOf(composeExpedition(ctxOf(p, START, seed)))) {
        if (e.type === 'E5' || e.type === 'E6') {
          const s = content.sentences.find((x) => x.id === e.sentenceId)!;
          for (const b of s.bricks) if (content.bricks.find((x) => x.id === b)!.tracked && !s.formulaIds.length) expect(ids).toContain(b);
          expect(s.formulaIds.every((f) => p.cards[f])).toBe(true);
        }
      }
    }
  });
});

describe('forme de l\'exercice selon la stabilité', () => {
  const allIds = [...allBrickIds, 'f.be', 'f.not', 'f.q'];
  const form = (id: string, stability: number) => {
    const p = finished(withCards(allIds, 1), 12);
    const types = new Set<string>();
    const ctx = ctxOf(p);
    for (let i = 0; i < 60; i++) {
      const e = exerciseForCard({ ...p.cards[id], stability }, ctx);
      if (e) types.add(e.type);
    }
    return types;
  };
  it('suit les échelons d\'une brique', () => {
    expect(form('b.he', 0.5)).toEqual(new Set(['E2', 'E3']));
    expect([...form('b.he', 2)].every((t) => ['E2', 'E4', 'E11'].includes(t))).toBe(true);
    expect([...form('b.he', 6)].every((t) => ['E4', 'E5', 'E6'].includes(t))).toBe(true);
    expect([...form('b.he', 20)].every((t) => ['E6', 'E8', 'E11'].includes(t))).toBe(true);
  });
  it('force l\'écoute si l\'oreille est en retard', () => {
    const p = finished(withCards(allIds, 1), 12);
    const ctx = ctxOf(p);
    for (let i = 0; i < 30; i++) {
      const e = exerciseForCard({ ...p.cards['b.he'], stability: 6, listenOk: 0, listenTotal: 5 }, ctx);
      expect(['E2', 'E6', 'E11']).toContain(e?.type);
    }
  });
  it('varie les phrases d\'une formule', () => {
    const p = finished(withCards(allIds, 1), 12);
    const recent = ['s.c01', 's.c02', 's.c03'];
    const ctx = ctxOf(p);
    for (let i = 0; i < 60; i++) {
      const e = exerciseForCard({ ...p.cards['f.be'], recentRefs: recent }, ctx);
      if (e && 'sentenceId' in e) expect(recent).not.toContain(e.sentenceId);
    }
  });
  it('passe un piège au thème quand il est stable', () => {
    const p = finished(withCards(['t.01', ...allIds], 1), 12);
    expect(exerciseForCard({ ...p.cards['t.01'], stability: 1 }, ctxOf(p))?.type).toBe('E9');
    expect(exerciseForCard({ ...p.cards['t.01'], stability: 10 }, ctxOf(p))?.type).toBe('E8');
  });
});

/** Joue un plan comme le ferait un joueur dont la réussite dépend de sa mémoire. */
function playPlan(start: ProgressSnapshot, plan: LessonPlan, now: number, rng: Rng, freshSuccess: number) {
  let p = beginPlan(start, plan);
  let st = createLessonState(plan);
  const seen = new Set<string>();
  let guard = 0;
  let lastEntered = -1;
  while (st.stage !== 'done' && st.stage !== 'trial_failed' && guard++ < 400) {
    const step = currentStep(st);
    if (st.index !== lastEntered) {
      lastEntered = st.index;
      p = enterStep(p, step, engine, now).next;
    }
    if (st.stage === 'feedback') {
      st = lessonReducer(st, { type: 'NEXT' });
      continue;
    }
    if (step?.kind !== 'exercise') {
      st = lessonReducer(st, { type: 'NEXT' });
      continue;
    }
    const ex = step.exercise;
    const memory = ex.targets
      .map((t) => p.cards[t])
      .filter(Boolean)
      .map((c) => engine.retrievability(c.state, now));
    const chance = memory.length ? Math.min(...memory) : freshSuccess;
    const result = rng() < chance ? ok() : ko(ex.targets);
    st = lessonReducer(st, { type: 'ANSWER', result });
    p = recordAnswer(p, st.answers[st.answers.length - 1], seen, null, engine, now).next;
  }
  if (st.stage === 'done') p = finishPlan(p, st, content, now);
  return { p, st };
}

describe('simulation de 60 jours', () => {
  function simulate(days: number[], seed: number, sessionsPerDay = 2) {
    const rng = seeded(seed);
    let p = emptyProgress();
    const stats = { sessions: 0, maxExercises: 0, maxReviewsOnly: 0, trialFails: 0 };
    for (const day of days) {
      for (let s = 0; s < sessionsPerDay; s++) {
        const now = START + day * DAY + s * 3_600_000;
        const ctx = { content, progress: p, engine, now, rng };
        if (!hasUsefulWork(ctx)) continue;
        const plan = composeExpedition(ctx);
        expect(plan.steps.length).toBeGreaterThan(0);
        const est = estimateSeconds(plan.steps);
        if (plan.passMin === null) expect(est).toBeLessThanOrEqual(BUDGET_SECONDS + 60);
        const { p: after, st } = playPlan(p, plan, now, rng, 0.9);
        p = refreshBossDoor(content.tier, after, engine, now);
        stats.sessions++;
        stats.maxExercises = Math.max(stats.maxExercises, plan.steps.filter((x) => x.kind === 'exercise').length);
        if (st.stage === 'trial_failed') stats.trialFails++;
      }
    }
    return { p, stats };
  }
  const daily = Array.from({ length: 60 }, (_, i) => i);

  it.each([1, 2, 3])('un joueur quotidien termine le palier et ouvre la porte (graine %i)', (seed) => {
    const { p, stats } = simulate(daily, seed);
    const now = START + 60 * DAY;
    expect(allNodesDone(content.tier, p)).toBe(true);
    expect(p.bossOpened).toBe(true);
    expect(cardList(p).length).toBe(53 + 3 + 16); // toutes les briques, les formules et les pièges
    expect(stats.sessions).toBeLessThanOrEqual(120);
    expect(computeSocle(cardList(p), engine, now)).toBeGreaterThanOrEqual(0.8);
    expect(consolidatedShare(cardList(p))).toBeGreaterThanOrEqual(0.8);
    // Les intervalles se sont allongés : la mémoire moyenne dépasse largement la bride de départ.
    const stabilities = cardList(p).map((c) => c.stability).sort((a, b) => a - b);
    expect(stabilities[Math.floor(stabilities.length / 2)]).toBeGreaterThan(5);
  });

  it('un joueur irrégulier (un jour sur quatre) progresse aussi', () => {
    const { p } = simulate(daily.filter((d) => d % 4 === 0), 4);
    expect(Object.values(p.nodes).filter((n) => n.status === 'completed').length).toBeGreaterThanOrEqual(8);
    expect(cardList(p).length).toBeGreaterThan(30);
  });

  it('un retour après 60 jours reste à 15 révisions et remonte le socle en quelques sessions', () => {
    const { p } = simulate(daily.slice(0, 30), 5);
    const rng = seeded(6);
    let now = START + 90 * DAY;
    let current = p;
    const low = computeSocle(cardList(current), engine, now);
    let sessions = 0;
    while (computeSocle(cardList(current), engine, now) < 0.7 && sessions < 12) {
      const plan = composeExpedition({ content, progress: current, engine, now, rng });
      const reviews = plan.steps.filter((s) => s.kind === 'exercise').length;
      if (!plan.nodeId) expect(reviews).toBeLessThanOrEqual(MAX_REVIEWS + 1);
      current = playPlan(current, plan, now, rng, 0.9).p;
      sessions++;
      now += 3_600_000;
    }
    expect(low).toBeLessThan(1);
    expect(sessions).toBeLessThan(12);
    expect(computeSocle(cardList(current), engine, now)).toBeGreaterThanOrEqual(0.7);
  });

  it('les nœuds terminés ne se referment jamais', () => {
    const { p } = simulate(daily.slice(0, 40), 7);
    const done = Object.keys(p.nodes).filter((id) => p.nodes[id].status === 'completed');
    const later = START + 400 * DAY;
    expect(computeSocle(cardList(p), engine, later)).toBeLessThan(0.7);
    for (const id of done) expect(p.nodes[id].status).toBe('completed');
    expect(nextNode(content, p) === undefined || !canStartNew({ progress: p, engine, now: later })).toBe(true);
  });
});

describe('verrous', () => {
  it('garde la porte fermée tant que les conditions manquent', () => {
    const p = finished(withCards(allBrickIds, 0), 12);
    const lock = bossLock(cardList(p), allNodesDone(content.tier, p), engine, START);
    expect(lock.nodesDone).toBe(true);
    expect(lock.consolidated).toBe(0);
    expect(lock.open).toBe(false);
    expect(refreshBossDoor(content.tier, p, engine, START).bossOpened).toBe(false);
  });
  it('ouvre la porte et ne la referme jamais', () => {
    const p = finished(withCards(allBrickIds, 0), 12);
    for (const id of allBrickIds) p.cards[id] = { ...p.cards[id], distinctSuccessDays: 2 };
    const opened = refreshBossDoor(content.tier, p, engine, START);
    expect(opened.bossOpened).toBe(true);
    expect(refreshBossDoor(content.tier, opened, engine, START + 1000 * DAY).bossOpened).toBe(true);
  });
});

describe('mémoire après le combat', () => {
  const fight = (seed: number): BossState => {
    const rng = seeded(seed);
    return createBossState(bossContent, drawBossVariants(bossContent, [], () => 1, rng), rng);
  };
  const place = (s: BossState, tokens: string[]) => {
    const round = currentRound(s);
    const used = new Set<string>();
    for (const id of tokens) {
      const b = round.bank.find((x) => x.brickId === id && !used.has(x.key))!;
      used.add(b.key);
      s = bossReducer(s, { type: 'PLACE', key: b.key });
    }
    return bossReducer(s, { type: 'SEAL' });
  };
  const allElements = [...allBrickIds, 'f.be', 'f.not', 'f.q'];

  it('met à jour chaque élément une seule fois, en À revoir pour une faute', () => {
    let s = fight(1);
    const round = currentRound(s);
    const wrong = round.bank.find((b) => !round.variant.tokens.includes(b.brickId))!.brickId;
    s = place(s, [wrong]);
    s = bossReducer(s, { type: 'CONTINUE' });
    const expected = round.variant.tokens[0];
    const p = withCards(allElements, 2);
    const { next, logs } = applyBossResults(p, s, content.bricks, engine, START);
    expect(blamedElements(s, content.bricks)).toContain(expected);
    expect(next.cards[expected].lastFromBoss).toBe(true);
    expect(next.cards[expected].lastWrong).toBe(true);
    expect(new Set(logs.map((l) => l.elementId)).size).toBe(logs.length);
    expect(logs.every((l) => l.source === 'boss')).toBe(true);
  });
  it('note Bon les pivots d\'un rang gagné, Difficile avec un ralenti', () => {
    let s = fight(2);
    s = bossReducer(s, { type: 'SLOW' });
    const round = currentRound(s);
    s = place(s, round.variant.tokens);
    const p = withCards(allElements, 2);
    const { logs } = applyBossResults(p, s, content.bricks, engine, START);
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.every((l) => l.rating === 'hard')).toBe(true);
  });
  it('ignore un élément sans carte', () => {
    const s = place(fight(3), currentRound(fight(3)).variant.tokens);
    const { logs } = applyBossResults(emptyProgress(), s, content.bricks, engine, START);
    expect(logs).toHaveLength(0);
  });
  it('compose la Préparation avec les seuls éléments fautifs', () => {
    const p = finished(withCards(allElements, 2), 12);
    const plan = composePreparation(['b.he', 'b.she', 'f.not'], ctxOf(p));
    expect(plan.kind).toBe('prep');
    expect(plan.nodeId).toBeNull();
    const exs = exercisesOf(plan);
    expect(exs).toHaveLength(3);
    for (const e of exs) expect(['E2', 'E6', 'E11']).toContain(e.type);
    for (const e of exs) expect(['b.he', 'b.she', 'f.not']).toEqual(expect.arrayContaining(e.targets));
  });
});
