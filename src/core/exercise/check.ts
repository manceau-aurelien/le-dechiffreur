// Correction déterministe de toutes les réponses (§3.1). Aucune réponse fausse sans explication.
import type { AuthoredExercise, Brick, Sentence } from '../../content/schema';
import type { CheckResult, DiffToken, LessonContent } from './types';

export function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[’`´]/g, "'")
    .replace(/[^\p{L}\p{N}'\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const CONTRACTIONS: [RegExp, string][] = [
  [/\bi'm\b/g, 'i am'],
  [/\b(you|we|they)'re\b/g, '$1 are'],
  [/\b(is|are)n't\b/g, '$1 not'],
  [/\b(\w+)'s\b/g, '$1 is'],
];

/** Développe les contractions : I'm = I am, isn't = is not. */
export function expand(normalized: string): string {
  return CONTRACTIONS.reduce((s, [from, to]) => s.replace(from, to), normalized);
}

/** Distance d'édition avec transposition, limitée aux petits écarts. */
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** Mots communs dans l'ordre : sert à surligner ce qui change. */
export function diffWords(expected: string, given: string): DiffToken[] {
  const a = expected.split(' ').filter(Boolean);
  const b = given.split(' ').filter(Boolean);
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out: DiffToken[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      out.push({ word: a[i], status: 'same' });
      i++;
      j++;
    } else if (j < b.length && (i === a.length || lcs[i][j + 1] >= lcs[i + 1][j])) {
      out.push({ word: b[j++], status: 'extra' });
    } else {
      out.push({ word: a[i++], status: 'missing' });
    }
  }
  return out;
}

const brickByText = (c: LessonContent) => new Map(c.bricks.map((b) => [b.en.toLowerCase(), b]));

function correctResult(expected: string, given: string, almost = false): CheckResult {
  return { correct: true, almost, expected, given, diff: [], blame: [], pourquoi: '', aRetenir: '' };
}

const elementOf = (b: Brick | undefined): string[] => {
  if (!b) return [];
  if (b.tracked) return [b.id];
  return b.ownerFormula ? [b.ownerFormula] : [];
};

/** Attribue la faute d'une phrase fausse : brique remplacée, outil renvoyé à sa formule, ordre renvoyé à la formule. */
export function blameFor(sentence: Sentence, given: string, content: LessonContent): string[] {
  const givenWords = new Set(expand(given).split(' '));
  const missing = sentence.bricks
    .map((id) => content.bricks.find((b) => b.id === id)!)
    .filter((b) => !expand(b.en.toLowerCase()).split(' ').every((w) => givenWords.has(w)));
  const blamed = missing.flatMap(elementOf);
  if (blamed.length) return [...new Set(blamed)];
  return sentence.formulaIds.length ? [sentence.formulaIds[0]] : sentence.bricks.flatMap((id) => elementOf(content.bricks.find((b) => b.id === id))).slice(0, 1);
}

function explainSentence(sentence: Sentence, given: string, content: LessonContent) {
  const isQuestion = sentence.en.trim().endsWith('?');
  const patterns = [
    ...content.formulas.filter((f) => sentence.formulaIds.includes(f.id)),
    ...content.formulas.filter((f) => !sentence.formulaIds.includes(f.id)),
  ].flatMap((f) => f.errorPatterns);
  for (const text of [given, expand(given)]) {
    for (const p of patterns) {
      if (p.onlyIfQuestion && !isQuestion) continue;
      if (new RegExp(p.match).test(text)) return { pourquoi: p.pourquoi, aRetenir: p.aRetenir, blame: [p.blame] };
    }
  }

  // Une seule brique remplacée : on explique ce que veut dire celle qui a été choisie.
  const blame = blameFor(sentence, given, content);
  const expected = expand(normalize(sentence.en)).split(' ');
  const typed = expand(given).split(' ');
  const formula = content.formulas.find((f) => sentence.formulaIds.includes(f.id));
  if (expected.length === typed.length) {
    const differing = expected.map((w, i) => [w, typed[i]] as const).filter(([w, t]) => w !== t);
    if (differing.length === 1) {
      const bricks = brickByText(content);
      const [want, got] = differing[0];
      const gotBrick = bricks.get(got);
      const wantBrick = bricks.get(want);
      if (gotBrick && wantBrick) {
        return {
          pourquoi: `« ${gotBrick.en} » veut dire ${gotBrick.fr[0]}. Ici, il fallait « ${wantBrick.en} ».`,
          aRetenir: `${wantBrick.en} = ${wantBrick.fr[0]}`,
          blame,
        };
      }
    }
  }
  return {
    pourquoi: `Il fallait dire : ${sentence.en} Regarde bien ce qui change.`,
    aRetenir: formula ? formula.ruleText : `${sentence.en} = ${sentence.fr}`,
    blame,
  };
}

/** Compare une réponse anglaise, tapée ou assemblée, à la phrase attendue. */
export function checkEnglish(sentence: Sentence, raw: string, content: LessonContent, allowTypo: boolean): CheckResult {
  const given = normalize(raw);
  const expandedGiven = expand(given);
  const accepted = [sentence.en, ...sentence.acceptedEn].map((s) => expand(normalize(s)));
  // « Yes, she's. » n'existe pas : on ne contracte pas en fin de réponse courte.
  const badFinalContraction = /(?:'s|'re|'m)$/.test(given);

  if (!badFinalContraction && accepted.includes(expandedGiven)) return correctResult(sentence.en, raw);

  if (allowTypo && !badFinalContraction) {
    const bricks = brickByText(content);
    const typed = expandedGiven.split(' ');
    for (const target of accepted) {
      const want = target.split(' ');
      if (want.length !== typed.length) continue;
      const differing = want.map((w, i) => [w, typed[i]] as const).filter(([w, t]) => w !== t);
      if (differing.length !== 1) continue;
      const [w, t] = differing[0];
      // Pas de tolérance si le mot tapé est lui-même une brique (here pour there).
      if (w.length >= 5 && editDistance(w, t) <= 1 && !bricks.has(t)) return correctResult(sentence.en, raw, true);
    }
  }

  const { pourquoi, aRetenir, blame } = explainSentence(sentence, given, content);
  return { correct: false, almost: false, expected: sentence.en, given: raw, diff: diffWords(normalize(sentence.en), given), blame, pourquoi, aRetenir };
}

/** E7 : les tuiles françaises assemblées. */
export function checkFrench(sentence: Sentence, tiles: string[]): CheckResult {
  const expected = frenchTiles(sentence).join(' ');
  const given = tiles.join(' ');
  if (normalize(given) === normalize(expected)) return correctResult(sentence.fr, given);
  return {
    correct: false,
    almost: false,
    expected: sentence.fr,
    given,
    diff: diffWords(expected, given),
    blame: sentence.formulaIds.slice(0, 1),
    pourquoi: `Il fallait dire : ${sentence.fr} Regarde bien ce qui change.`,
    aRetenir: `${sentence.en} = ${sentence.fr}`,
  };
}

/** Découpe aux espaces. Ni majuscule ni ponctuation, pour ne pas révéler le premier mot. */
export function frenchTiles(sentence: Sentence): string[] {
  return sentence.fr
    .replace(/[.,?!]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (/^(Tom|Anna)$/.test(w) ? w : w.toLowerCase()));
}

/** E2, E3 et E4 : le joueur a choisi une brique. */
export function checkBrickChoice(expected: Brick, chosen: Brick): CheckResult {
  if (expected.id === chosen.id) return correctResult(expected.en, chosen.en);
  const note = expected.note ? ` ${expected.note}` : '';
  return {
    correct: false,
    almost: false,
    expected: expected.en,
    given: chosen.en,
    diff: [],
    blame: [expected.id],
    pourquoi: `« ${chosen.en} » veut dire ${chosen.fr[0]}.`,
    aRetenir: `${expected.en} = ${expected.fr[0]}.${note}`,
  };
}

/** E9 et E11 : une option rédigée. */
export function checkOption(exercise: Extract<AuthoredExercise, { type: 'E9' | 'E11' }>, option: number): CheckResult {
  const chosen = exercise.options[option];
  const right = exercise.options.find((o) => o.correct)!;
  if (chosen.correct) return correctResult(right.text, chosen.text);
  return {
    correct: false,
    almost: false,
    expected: right.text,
    given: chosen.text,
    diff: [],
    blame: exercise.targets.slice(0, 1),
    pourquoi: chosen.pourquoi ?? `Il fallait choisir : ${right.text}`,
    aRetenir: chosen.aRetenir ?? right.text,
  };
}

/** E10 : le joueur a touché une brique, puis choisi son remplacement. */
export function checkCorrection(
  exercise: Extract<AuthoredExercise, { type: 'E10' }>,
  tappedIndex: number,
  replacement: string | null,
): CheckResult {
  const fixed = exercise.audioText;
  const tapped = exercise.tokens[tappedIndex];
  const given = exercise.tokens.join(' ');
  if (tappedIndex === exercise.wrongIndex && replacement === exercise.correct) return correctResult(fixed, given);
  const wrongWord = exercise.tokens[exercise.wrongIndex];
  return {
    correct: false,
    almost: false,
    expected: fixed,
    given,
    diff: [],
    blame: exercise.targets.slice(0, 1),
    pourquoi:
      tappedIndex !== exercise.wrongIndex
        ? `« ${tapped} » est correct ici. La brique fausse est « ${wrongWord} ». ${exercise.pourquoi}`
        : `« ${replacement} » ne convient pas. ${exercise.pourquoi}`,
    aRetenir: exercise.aRetenir,
  };
}
