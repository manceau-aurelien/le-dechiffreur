import type { AuthoredExercise, Brick, Formula, Sentence, Tier, Trap } from '../../content/schema';

export type Rng = () => number;

export interface LessonContent {
  tier: Tier;
  bricks: Brick[];
  sentences: Sentence[];
  formulas: Formula[];
  traps: Trap[];
  exercises: AuthoredExercise[];
}

export type Voice = 'voiceA' | 'voiceB';

export interface TileChoice {
  key: string;
  text: string;
}

interface Base {
  targets: string[]; // éléments testés : brique, formule ou piège
  voice: Voice;
}

export type Exercise =
  | (Base & { type: 'E2' | 'E3' | 'E4'; brickId: string; options: string[] })
  | (Base & { type: 'E5' | 'E6'; sentenceId: string; bank: { key: string; brickId: string }[] })
  | (Base & { type: 'E7'; sentenceId: string; tiles: TileChoice[] })
  | (Base & { type: 'E8'; sentenceId: string })
  | (Base & { type: 'E9' | 'E11'; authoredId: string; optionOrder: number[] })
  | (Base & { type: 'E10'; authoredId: string; replacementOrder: number[] });

export type ExerciseType = Exercise['type'];

export interface DiffToken {
  word: string;
  status: 'same' | 'missing' | 'extra';
}

/** Résultat d'une réponse. Une réponse fausse porte toujours pourquoi et aRetenir. */
export interface CheckResult {
  correct: boolean;
  almost: boolean; // juste, avec une faute de frappe tolérée
  expected: string;
  given: string;
  diff: DiffToken[];
  blame: string[]; // éléments fautifs, vides si la réponse est juste
  pourquoi: string;
  aRetenir: string;
}
