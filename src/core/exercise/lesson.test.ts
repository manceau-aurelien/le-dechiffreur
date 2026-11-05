import { lessonContent as content } from '../../content';
import { completeNode, emptyProgress, markCorrect, markPresented, nodeStatus, startNode, veinIsComplete } from '../progress/progress';
import { checkBrickChoice, checkCorrection, checkEnglish, checkFrench, checkOption, editDistance, expand, frenchTiles, normalize } from './check';
import { adaptForSilence, assemblyExercise, authored, brick, brickExercise, nodeIndex, sentence, versionExercise } from './generate';
import {
  composeFormula,
  composeLesson,
  composeVein,
  createLessonState,
  currentStep,
  estimateSeconds,
  lessonReducer,
  type LessonState,
} from './lesson';
import type { CheckResult, Rng } from './types';

const seeded = (seed: number): Rng => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const node = (id: string) => content.tier.nodes.find((n) => n.id === id)!;
const s = (id: string) => sentence(content, id);
const typed = (id: string, raw: string) => checkEnglish(s(id), raw, content, true);

const ok: CheckResult = { correct: true, almost: false, expected: '', given: '', diff: [], blame: [], pourquoi: '', aRetenir: '' };
const ko: CheckResult = { ...ok, correct: false, pourquoi: 'p', aRetenir: 'r' };

describe('normalisation', () => {
  it('ignore la casse, les espaces, la ponctuation et les apostrophes typographiques', () => {
    expect(normalize('  She’s   HAPPY !! ')).toBe("she's happy");
    expect(normalize('Is he late? No, he isn’t.')).toBe("is he late no he isn't");
  });
  it('développe les contractions', () => {
    expect(expand("i'm late")).toBe('i am late');
    expect(expand("he's here")).toBe('he is here');
    expect(expand("they're cold")).toBe('they are cold');
    expect(expand("she isn't here")).toBe('she is not here');
    expect(expand("we aren't late")).toBe('we are not late');
  });
  it('mesure les fautes de frappe, transpositions comprises', () => {
    expect(editDistance('tired', 'tierd')).toBe(1);
    expect(editDistance('hungry', 'angry')).toBe(2);
  });
});

describe('thème (E8)', () => {
  it('accepte la phrase, ses contractions et ses variantes', () => {
    expect(typed('s.c05', 'I am hungry.').correct).toBe(true);
    expect(typed('s.c05', "i'm hungry").correct).toBe(true);
    expect(typed('s.c12', 'I am a doctor').correct).toBe(true);
    expect(typed('s.c57', 'I am Tom').correct).toBe(true);
    expect(typed('s.c42', 'He is not French').correct).toBe(true);
  });
  it('tolère une faute de frappe sur un mot de 5 lettres ou plus, notée presque', () => {
    const r = typed('s.c10', 'They are tierd');
    expect(r.correct).toBe(true);
    expect(r.almost).toBe(true);
  });
  it('ne tolère pas de faute sur un mot court', () => {
    expect(typed('s.c27', 'It is a kay').correct).toBe(false);
  });
  it('ne tolère pas une autre brique du jeu (here pour there)', () => {
    expect(typed('s.c53', 'The ship is here').correct).toBe(false);
    expect(typed('s.c53', 'The ship is here').almost).toBe(false);
  });
  it('refuse une contraction en fin de réponse courte', () => {
    const r = typed('s.c75', "Are you tired? Yes, I'm");
    expect(r.correct).toBe(false);
    const q3 = typed('s.c76', "Is he late? No, he's");
    expect(q3.correct).toBe(false);
  });
  it('accepte la réponse courte négative contractée', () => {
    expect(typed('s.c76', "Is he late? No, he isn't.").correct).toBe(true);
    expect(typed('s.c76', 'Is he late? No, he is not.').correct).toBe(true);
  });
  it('sans tolérance pour un assemblage de briques', () => {
    expect(checkEnglish(s('s.c10'), 'they are tierd', content, false).correct).toBe(false);
  });
});

describe('motifs d\'erreur (§6.5)', () => {
  const cases: [string, string, string][] = [
    ['be1', 's.c05', 'I is hungry'],
    ['be2', 's.c07', 'She are angry'],
    ['be3', 's.c10', 'They is tired'],
    ['be4', 's.c02', 'You are doctor'],
    ['be5', 's.c27', 'It is an key'],
    ['be6', 's.c04', 'She is a artist'],
    ['be7', 's.c05', 'I have hunger'],
    ['no1', 's.c42', 'He not is French'],
    ['no2', 's.c40', "I amn't late"],
    ['no3', 's.c43', 'She is no hungry'],
    ['no4', 's.c42', "He don't French"],
    ['q1', 's.c68', 'Where the station is'],
    ['q2', 's.c62', 'He is a doctor'],
    ['q3', 's.c76', "Is he late? No he's"],
    ['q4', 's.c72', 'How you call'],
  ];
  it.each(cases)('%s reconnaît « %s »', (id, sentenceId, raw) => {
    const pattern = content.formulas.flatMap((f) => f.errorPatterns).find((p) => p.id === id)!;
    const r = typed(sentenceId, raw);
    expect(r.correct).toBe(false);
    expect(r.pourquoi).toBe(pattern.pourquoi);
    expect(r.aRetenir).toBe(pattern.aRetenir);
    expect(r.blame).toEqual([pattern.blame]);
  });

  it('explique une brique remplacée par ce qu\'elle veut dire', () => {
    const r = typed('s.c03', 'She is a sailor');
    expect(r.pourquoi).toContain('« she » veut dire elle');
    expect(r.blame).toEqual(['b.he']);
  });

  it('renvoie un outil faux à sa formule et une erreur d\'ordre à la formule', () => {
    expect(typed('s.c04', 'She is a sailor').blame).toContain('b.artist');
    expect(typed('s.c03', 'Is he a sailor').blame).toEqual(['f.be']);
  });
});

describe('une erreur enseigne toujours', () => {
  it('toute phrase fausse produit pourquoi et aRetenir', () => {
    for (const sent of content.sentences) {
      for (const raw of ['xx yy', sent.en.split(' ').reverse().join(' ') + ' zz']) {
        const r = typed(sent.id, raw);
        expect(r.correct).toBe(false);
        expect(r.pourquoi.trim()).not.toBe('');
        expect(r.aRetenir.trim()).not.toBe('');
      }
      const fr = checkFrench(sent, ['faux']);
      expect(fr.correct).toBe(false);
      expect(fr.pourquoi.trim()).not.toBe('');
    }
  });
  it('tout exercice rédigé explique chaque réponse fausse', () => {
    for (const e of content.exercises) {
      if (e.type === 'E10') {
        const wrongTap = checkCorrection(e, (e.wrongIndex + 1) % e.tokens.length, null);
        expect(wrongTap.correct).toBe(false);
        expect(wrongTap.pourquoi).toContain(e.pourquoi);
        const wrongPick = checkCorrection(e, e.wrongIndex, e.replacements.find((x) => x !== e.correct)!);
        expect(wrongPick.correct).toBe(false);
        expect(checkCorrection(e, e.wrongIndex, e.correct).correct).toBe(true);
        continue;
      }
      e.options.forEach((o, i) => {
        const r = checkOption(e, i);
        expect(r.correct).toBe(o.correct);
        if (!o.correct) {
          expect(r.pourquoi).toBe(o.pourquoi);
          expect(r.aRetenir).toBe(o.aRetenir);
        }
      });
    }
  });
  it('un mauvais choix de brique explique le mot choisi et le mot attendu', () => {
    const r = checkBrickChoice(brick(content, 'b.hungry'), brick(content, 'b.angry'));
    expect(r.pourquoi).toContain('en colère');
    expect(r.aRetenir).toContain('qui a faim');
    expect(r.aRetenir).toContain('h soufflé');
  });
});

describe('génération', () => {
  it('propose des options valides et contenant la bonne réponse pour chaque brique', () => {
    const rng = seeded(2);
    for (const b of content.bricks.filter((x) => x.tracked)) {
      for (const type of ['E2', 'E3', 'E4'] as const) {
        const ex = brickExercise(type, b.id, content, b.nodeId, rng);
        if (ex.type !== type) throw new Error('type');
        expect(ex.options).toContain(b.id);
        expect(new Set(ex.options).size).toBe(ex.options.length);
        expect(ex.options.length).toBeGreaterThanOrEqual(3);
      }
    }
  });
  it('préfère les briques proches à l\'oreille', () => {
    const ex = brickExercise('E2', 'b.hungry', content, 'n.1.04', seeded(1));
    if (ex.type !== 'E2') throw new Error('type');
    expect(ex.options).toContain('b.angry');
  });
  it('n\'utilise jamais de brique pas encore introduite', () => {
    const rng = seeded(3);
    for (const sent of content.sentences) {
      const ex = assemblyExercise('E5', sent.id, content, sent.minNodeId, rng);
      if (ex.type !== 'E5') throw new Error('type');
      for (const b of ex.bank) {
        expect(nodeIndex(content, brick(content, b.brickId).nodeId)).toBeLessThanOrEqual(nodeIndex(content, sent.minNodeId));
      }
      expect(ex.bank.length).toBeGreaterThan(sent.bricks.length);
    }
  });
  it('rend l\'assemblage juste réalisable avec la banque', () => {
    const rng = seeded(4);
    for (const sent of content.sentences) {
      const ex = assemblyExercise('E6', sent.id, content, sent.minNodeId, rng);
      if (ex.type !== 'E6') throw new Error('type');
      const raw = sent.bricks.map((b) => brick(content, b).en).join(' ');
      expect(checkEnglish(sent, raw, content, false).correct).toBe(true);
    }
  });
  it('rend la version réalisable avec les tuiles, sans révéler le premier mot', () => {
    const rng = seeded(5);
    for (const sent of content.sentences) {
      const own = frenchTiles(sent);
      const ex = versionExercise(sent.id, content, rng);
      if (ex.type !== 'E7') throw new Error('type');
      const texts = ex.tiles.map((t) => t.text);
      for (const t of own) expect(texts).toContain(t);
      expect(checkFrench(sent, own).correct).toBe(true);
      for (const t of texts) expect(t === t.toLowerCase() || t === 'Tom').toBe(true);
    }
  });
  it('remplace les exercices d\'écoute quand le son est coupé', () => {
    const ex = brickExercise('E2', 'b.he', content, 'n.1.02', seeded(1));
    expect(adaptForSilence(ex).type).toBe('E3');
    expect(adaptForSilence(assemblyExercise('E6', 's.c03', content, 'n.1.05', seeded(1))).type).toBe('E5');
  });
  it('trouve ses exercices rédigés', () => {
    expect(authored(content, 'x.c01', 'E10').correct).toBe('am');
  });
});

describe('composition d\'un filon', () => {
  it('présente au plus 5 briques neuves, chacune suivie d\'un test immédiat', () => {
    const plan = composeVein(node('n.1.10'), content, emptyProgress(), seeded(1));
    const presents = plan.steps.filter((x) => x.kind === 'present');
    expect(presents).toHaveLength(5);
    plan.steps.forEach((step, i) => {
      if (step.kind !== 'present') return;
      const next = plan.steps[i + 1];
      if (next.kind !== 'exercise' || (next.exercise.type !== 'E2' && next.exercise.type !== 'E3')) throw new Error('test immédiat attendu');
      expect(next.exercise.brickId).toBe(step.brickId);
    });
  });
  it('reprend les briques restantes à la leçon suivante', () => {
    let p = emptyProgress();
    const vein = node('n.1.10');
    for (const id of vein.brickIds!.slice(0, 5)) p = markCorrect(markPresented(p, id, 1), [id], 1);
    const plan = composeVein(vein, content, p, seeded(1));
    const presents = plan.steps.flatMap((x) => (x.kind === 'present' ? [x.brickId] : []));
    expect(presents).toEqual(vein.brickIds!.slice(5));
  });
  it('tient dans une session courte, à chaque nœud', () => {
    for (const n of content.tier.nodes.filter((x) => x.kind === 'vein')) {
      for (let seed = 1; seed < 6; seed++) {
        const seconds = estimateSeconds(composeVein(n, content, emptyProgress(), seeded(seed)).steps);
        expect(seconds).toBeLessThanOrEqual(360);
      }
    }
  });
  it('n\'inclut aucune phrase pas encore jouable', () => {
    for (const n of content.tier.nodes.filter((x) => x.kind !== 'boss')) {
      const plan = composeLesson(n, content, emptyProgress(), seeded(7));
      for (const step of [...plan.steps, ...plan.afterPass]) {
        if (step.kind !== 'exercise' || !('sentenceId' in step.exercise)) continue;
        expect(nodeIndex(content, s(step.exercise.sentenceId).minNodeId)).toBeLessThanOrEqual(nodeIndex(content, n.id));
      }
    }
  });
  it('ne teste une phrase que si toutes ses briques ont déjà été rencontrées', () => {
    for (const n of content.tier.nodes.filter((x) => x.kind === 'vein')) {
      for (let seed = 1; seed < 8; seed++) {
        const plan = composeVein(n, content, emptyProgress(), seeded(seed));
        const seen = new Set(n.brickIds!.filter((id) => plan.steps.some((x) => x.kind === 'present' && x.brickId === id)));
        const later = n.brickIds!.filter((id) => !seen.has(id));
        for (const st of plan.steps) {
          if (st.kind !== 'exercise' || !('sentenceId' in st.exercise)) continue;
          for (const b of s(st.exercise.sentenceId).bricks) expect(later).not.toContain(b);
        }
      }
    }
  });
  it('préfère les distracteurs déjà rencontrés', () => {
    const plan = composeVein(node('n.1.01'), content, emptyProgress(), seeded(1));
    const firstBricks = node('n.1.01').brickIds!.slice(0, 5);
    for (const st of plan.steps) {
      if (st.kind !== 'exercise' || (st.exercise.type !== 'E4' && st.exercise.type !== 'E3')) continue;
      if (plan.steps.indexOf(st) < plan.steps.findLastIndex((x) => x.kind === 'present') + 2) continue;
      for (const o of st.exercise.options) expect(firstBricks).toContain(o);
    }
  });
  it('fait jouer les pièges du nœud', () => {
    const plan = composeVein(node('n.1.08'), content, emptyProgress(), seeded(1));
    const e9 = plan.steps.filter((x) => x.kind === 'exercise' && x.exercise.type === 'E9');
    expect(e9.length).toBe(3);
  });
  it('rejoue un filon terminé sans présentation', () => {
    let p = emptyProgress();
    const vein = node('n.1.02');
    for (const id of vein.brickIds!) p = markCorrect(markPresented(p, id, 1), [id], 1);
    const plan = composeVein(vein, content, p, seeded(1));
    expect(plan.steps.some((x) => x.kind === 'present')).toBe(false);
    expect(plan.steps.length).toBeGreaterThan(0);
  });
});

function play(state: LessonState, answers: (kind: string) => CheckResult): LessonState {
  let st = state;
  let guard = 0;
  while (st.stage !== 'done' && st.stage !== 'trial_failed' && guard++ < 200) {
    const step = currentStep(st)!;
    if (st.stage === 'feedback') st = lessonReducer(st, { type: 'NEXT' });
    else if (step.kind === 'exercise') st = lessonReducer(st, { type: 'ANSWER', result: answers(step.exercise.type) });
    else st = lessonReducer(st, { type: 'NEXT' });
  }
  return st;
}

describe('déroulement', () => {
  const vein = () => createLessonState(composeVein(node('n.1.01'), content, emptyProgress(), seeded(1)));

  it('impose de répondre avant d\'avancer', () => {
    let st = vein();
    while (currentStep(st)!.kind !== 'exercise') st = lessonReducer(st, { type: 'NEXT' });
    const index = st.index;
    expect(lessonReducer(st, { type: 'NEXT' }).index).toBe(index);
  });
  it('fait revenir une erreur une seule fois, sous une autre forme', () => {
    let st = vein();
    while (currentStep(st)!.kind !== 'exercise') st = lessonReducer(st, { type: 'NEXT' });
    const before = st.steps.length;
    const failed = currentStep(st)!;
    st = lessonReducer(st, { type: 'ANSWER', result: ko });
    expect(st.stage).toBe('feedback');
    expect(st.steps).toHaveLength(before + 1);
    const back = st.steps[st.steps.length - 1];
    if (back.kind !== 'exercise' || failed.kind !== 'exercise') throw new Error('exercice attendu');
    expect(back.isRetry).toBe(true);
    expect(back.exercise.type).not.toBe(failed.exercise.type);

    const end = play(st, () => ko);
    const retries = end.answers.filter((a) => a.isRetry);
    expect(end.stage).toBe('done');
    expect(end.steps.filter((x) => x.kind === 'exercise' && x.isRetry)).toHaveLength(retries.length);
    expect(retries.length).toBe(end.answers.filter((a) => !a.isRetry).length);
  });
});

describe('épreuve de formule', () => {
  const trial = (seed = 1, last: string[] = []) => createLessonState(composeFormula(node('n.1.05'), content, emptyProgress(), seeded(seed), last));

  it('compte quatre indices, une hypothèse et six exercices', () => {
    const st = trial();
    expect(st.steps.filter((x) => x.kind === 'clue')).toHaveLength(4);
    expect(st.steps.filter((x) => x.kind === 'hypothesis')).toHaveLength(1);
    const ex = st.steps.filter((x) => x.kind === 'exercise');
    expect(ex).toHaveLength(6);
    const last = ex[5];
    if (last.kind !== 'exercise') throw new Error('exercice attendu');
    expect(last.exercise.type).toBe('E8');
  });
  it('réussit avec 5 sur 6 et le dernier juste, puis révèle la règle', () => {
    let count = 0;
    const end = play(trial(), () => (++count <= 1 ? ko : ok));
    expect(end.stage).toBe('done');
    expect(end.trialPassed).toBe(true);
    expect(end.trialCorrect).toBeGreaterThanOrEqual(5);
    expect(end.steps.some((x) => x.kind === 'unseal')).toBe(true);
  });
  it('échoue si le dernier exercice est faux, même avec 5 justes', () => {
    let count = 0;
    const end = play(trial(), () => (++count === 6 ? ko : ok));
    expect(end.stage).toBe('trial_failed');
    expect(end.trialCorrect).toBe(5);
  });
  it('échoue avec 4 sur 6', () => {
    let count = 0;
    const end = play(trial(), () => (++count <= 2 ? ko : ok));
    expect(end.stage).toBe('trial_failed');
  });
  it('une épreuve ne fait pas revenir les erreurs', () => {
    let count = 0;
    const end = play(trial(), () => (++count === 1 ? ko : ok));
    expect(end.answers.filter((a) => a.trial && a.isRetry)).toHaveLength(0);
  });
  it('change de candidats au nouvel essai quand le contenu le permet', () => {
    const first = composeFormula(node('n.1.05'), content, emptyProgress(), seeded(1));
    const second = composeFormula(node('n.1.05'), content, emptyProgress(), seeded(2), first.trialPicked);
    for (const id of second.trialPicked) expect(first.trialPicked).not.toContain(id);
  });
});

describe('progression de la carte', () => {
  const tier = content.tier;
  it('ouvre seulement le premier nœud au départ', () => {
    const p = emptyProgress();
    expect(nodeStatus(tier, p, tier.nodes[0])).toBe('available');
    expect(nodeStatus(tier, p, tier.nodes[1])).toBe('locked');
    expect(nodeStatus(tier, p, tier.nodes[12])).toBe('locked');
  });
  it('débloque dans l\'ordre et garde un nœud terminé ouvert', () => {
    let p = startNode(emptyProgress(), 'n.1.01');
    expect(nodeStatus(tier, p, tier.nodes[0])).toBe('in_progress');
    p = completeNode(p, 'n.1.01', 5);
    expect(nodeStatus(tier, p, tier.nodes[0])).toBe('completed');
    expect(nodeStatus(tier, p, tier.nodes[1])).toBe('available');
    p = startNode(p, 'n.1.01');
    expect(nodeStatus(tier, p, tier.nodes[0])).toBe('completed');
  });
  it('un filon se termine quand chaque brique est réussie', () => {
    const vein = tier.nodes[0];
    let p = emptyProgress();
    for (const id of vein.brickIds!.slice(1)) p = markCorrect(p, [id], 1);
    expect(veinIsComplete(p, vein)).toBe(false);
    p = markCorrect(p, [vein.brickIds![0]], 1);
    expect(veinIsComplete(p, vein)).toBe(true);
  });
  it('le mode développeur ouvre tout', () => {
    const p = { ...emptyProgress(), devUnlockAll: true };
    expect(nodeStatus(tier, p, tier.nodes[12])).toBe('available');
  });
});
