import boss from '../../../content/tiers/tier-01/boss.json';
import { BossSchema } from '../../content/schema';
import {
  bossReducer,
  buildRound,
  createBossState,
  currentRound,
  drawBossVariants,
  flamesLeft,
  replaysLeft,
  variantIdsOf,
  type BossState,
  type Rng,
} from './engine';

const BOSS = BossSchema.parse(boss);
const seeded = (seed: number): Rng => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const fresh = (seed = 1) => {
  const rng = seeded(seed);
  return createBossState(BOSS, drawBossVariants(BOSS, [], () => 1, rng), rng);
};

/** Place et scelle la séquence attendue. */
function sealRight(s: BossState): BossState {
  const round = currentRound(s);
  const used = new Set<string>();
  for (const id of round.variant.tokens) {
    const brick = round.bank.find((b) => b.brickId === id && !used.has(b.key))!;
    used.add(brick.key);
    s = bossReducer(s, { type: 'PLACE', key: brick.key });
  }
  return bossReducer(s, { type: 'SEAL' });
}

/** Place et scelle une séquence fausse : un distracteur seul. */
function sealWrong(s: BossState): BossState {
  const round = currentRound(s);
  const wrong = round.bank.find((b) => !round.variant.tokens.includes(b.brickId))!;
  return bossReducer(bossReducer(s, { type: 'PLACE', key: wrong.key }), { type: 'SEAL' });
}

const rightOption = (s: BossState) => currentRound(s).variant.riposte!.options.findIndex((o) => o.correct);
const wrongOption = (s: BossState) => currentRound(s).variant.riposte!.options.findIndex((o) => !o.correct);

/** Gagne le rang en cours et passe au suivant. */
function winRank(s: BossState): BossState {
  s = sealRight(s);
  if (s.stage === 'riposte') s = bossReducer(s, { type: 'ANSWER', option: rightOption(s) });
  return bossReducer(s, { type: 'CONTINUE' });
}
const loseRank = (s: BossState) => bossReducer(sealWrong(s), { type: 'CONTINUE' });

describe('déroulement du combat', () => {
  it('gagne après dix rangs réussis', () => {
    let s = fresh();
    for (let i = 0; i < 10; i++) s = winRank(s);
    expect(s.stage).toBe('won');
    expect(s.errors).toBe(0);
    expect(s.results).toHaveLength(10);
  });

  it('passe directement au verdict aux rangs 1 et 2, sans Riposte', () => {
    const s = sealRight(fresh());
    expect(s.stage).toBe('verdict_ok');
  });

  it('demande une Riposte à partir du rang 3', () => {
    let s = fresh();
    s = winRank(winRank(s));
    expect(currentRound(s).rank).toBe(3);
    expect(sealRight(s).stage).toBe('riposte');
  });

  it('exige l\'ordre exact des briques', () => {
    let s = fresh();
    s = winRank(winRank(winRank(s))); // rang 4 : au moins quatre briques
    const round = currentRound(s);
    const tokens = [...round.variant.tokens].reverse();
    const used = new Set<string>();
    for (const id of tokens) {
      const brick = round.bank.find((b) => b.brickId === id && !used.has(b.key))!;
      used.add(brick.key);
      s = bossReducer(s, { type: 'PLACE', key: brick.key });
    }
    s = bossReducer(s, { type: 'SEAL' });
    expect(s.stage).toBe('verdict_error');
    expect(s.lastError).toBe('sequence');
  });

  it('ne scelle pas une table vide', () => {
    expect(bossReducer(fresh(), { type: 'SEAL' }).stage).toBe('build');
  });

  it('permet de retirer une brique placée', () => {
    let s = fresh();
    const key = currentRound(s).bank[0].key;
    s = bossReducer(s, { type: 'PLACE', key });
    expect(s.placed).toEqual([key]);
    expect(bossReducer(s, { type: 'REMOVE', key }).placed).toEqual([]);
  });
});

describe('erreurs et flammes', () => {
  it('trois erreurs passent, la quatrième termine le combat', () => {
    let s = fresh();
    for (let i = 0; i < 3; i++) {
      s = loseRank(s);
      expect(s.stage).toBe('build');
    }
    expect(s.errors).toBe(3);
    expect(flamesLeft(s)).toBe(0);
    s = sealWrong(s);
    expect(s.stage).toBe('verdict_error');
    s = bossReducer(s, { type: 'CONTINUE' });
    expect(s.stage).toBe('lost');
    expect(s.errors).toBe(4);
  });

  it('gagne avec exactement trois erreurs', () => {
    let s = fresh();
    for (let i = 0; i < 3; i++) s = loseRank(s);
    for (let i = 0; i < 7; i++) s = winRank(s);
    expect(s.stage).toBe('won');
    expect(s.errors).toBe(3);
  });

  it('un rang coûte au plus une erreur : séquence fausse, pas de Riposte', () => {
    let s = fresh();
    s = winRank(winRank(s));
    s = sealWrong(s);
    expect(s.errors).toBe(1);
    expect(bossReducer(s, { type: 'ANSWER', option: 0 }).errors).toBe(1);
    expect(bossReducer(s, { type: 'CONTINUE' }).index).toBe(3);
  });

  it('une mauvaise Riposte coûte une erreur', () => {
    let s = fresh();
    s = sealRight(winRank(winRank(s)));
    s = bossReducer(s, { type: 'ANSWER', option: wrongOption(s) });
    expect(s.errors).toBe(1);
    expect(s.lastError).toBe('riposte');
    expect(s.results.at(-1)?.outcome).toBe('riposte');
  });

  it('abandonner ne compte ni comme victoire ni comme défaite', () => {
    const s = bossReducer(fresh(), { type: 'ABANDON' });
    expect(s.stage).toBe('abandoned');
    expect(s.errors).toBe(0);
    expect(bossReducer(s, { type: 'SEAL' })).toBe(s);
  });
});

describe('écoutes', () => {
  it('limite à deux réécoutes par rang et remet à zéro au rang suivant', () => {
    let s = fresh();
    const start = s.audio.nonce;
    s = bossReducer(s, { type: 'REPLAY' });
    s = bossReducer(s, { type: 'REPLAY' });
    expect(replaysLeft(s)).toBe(0);
    expect(s.audio.nonce).toBe(start + 2);
    const blocked = bossReducer(s, { type: 'REPLAY' });
    expect(blocked.audio.nonce).toBe(start + 2);
    s = winRank(s);
    expect(replaysLeft(s)).toBe(2);
  });

  it('partage trois ralentis sur tout le combat, sans toucher aux réécoutes', () => {
    let s = fresh();
    s = bossReducer(s, { type: 'SLOW' });
    expect(s.audio.slow).toBe(true);
    expect(replaysLeft(s)).toBe(2);
    s = winRank(s);
    s = bossReducer(bossReducer(s, { type: 'SLOW' }), { type: 'SLOW' });
    expect(s.slowLeft).toBe(0);
    const nonce = s.audio.nonce;
    expect(bossReducer(s, { type: 'SLOW' }).audio.nonce).toBe(nonce);
  });

  it('une réécoute n\'est jamais une erreur et reste possible pendant la Riposte', () => {
    let s = fresh();
    s = sealRight(winRank(winRank(s)));
    expect(s.stage).toBe('riposte');
    s = bossReducer(s, { type: 'REPLAY' });
    expect(s.replaysUsed).toBe(1);
    expect(s.errors).toBe(0);
  });

  it('redemande la lecture à chaque nouveau rang', () => {
    const s = fresh();
    const next = winRank(s);
    expect(next.audio.nonce).toBeGreaterThan(s.audio.nonce);
    expect(next.audio.slow).toBe(false);
  });
});

describe('reprise après interruption', () => {
  it('reprend au même rang avec une autre phrase', () => {
    let s = fresh();
    s = loseRank(winRank(s));
    const rng = seeded(9);
    const rank = BOSS.ranks[s.index];
    const other = rank.variants.find((v) => v.id !== currentRound(s).variant.id)!;
    const resumed = bossReducer(s, { type: 'RESUME', round: buildRound(rank.order, other, rng) });
    expect(resumed.index).toBe(s.index);
    expect(resumed.errors).toBe(1);
    expect(currentRound(resumed).variant.id).toBe(other.id);
    expect(resumed.placed).toEqual([]);
  });
});

describe('tirage des variantes', () => {
  it('ne reprend jamais une variante du combat précédent', () => {
    const rng = seeded(3);
    let last: string[] = [];
    for (let i = 0; i < 200; i++) {
      const drawn = drawBossVariants(BOSS, last, () => 1, rng).map((v) => v.id);
      expect(drawn).toHaveLength(10);
      for (const id of drawn) expect(last).not.toContain(id);
      last = drawn;
    }
  });

  it('couvre toutes les variantes sur un grand nombre de combats', () => {
    const rng = seeded(4);
    const seen = new Set<string>();
    let last: string[] = [];
    for (let i = 0; i < 100; i++) {
      last = drawBossVariants(BOSS, last, () => 1, rng).map((v) => v.id);
      last.forEach((id) => seen.add(id));
    }
    expect(seen.size).toBe(30);
  });

  it('favorise les éléments usés, selon le poids 1 + 2 × (1 − R)', () => {
    const rng = seeded(5);
    const rank1 = { ...BOSS, ranks: [BOSS.ranks[0]] };
    const counts: Record<string, number> = {};
    const worn = (el: string) => (el === 'b.hungry' ? 0 : 1); // poids 3 contre 1 et 1
    for (let i = 0; i < 5000; i++) {
      const [v] = drawBossVariants(rank1, [], worn, rng);
      counts[v.id] = (counts[v.id] ?? 0) + 1;
    }
    expect(counts['v.1.01.a'] / 5000).toBeGreaterThan(0.56);
    expect(counts['v.1.01.a'] / 5000).toBeLessThan(0.64);
  });

  it('le tirage reste stable pour une même graine', () => {
    expect(variantIdsOf(fresh(7))).toEqual(variantIdsOf(fresh(7)));
  });
});

describe('banque de briques', () => {
  it('contient la séquence et les distracteurs, avec des clés uniques', () => {
    for (const rank of BOSS.ranks) {
      for (const v of rank.variants) {
        const round = buildRound(rank.order, v, seeded(11));
        expect(round.bank).toHaveLength(v.tokens.length + v.distractors.length);
        expect(new Set(round.bank.map((b) => b.key)).size).toBe(round.bank.length);
      }
    }
  });
});
