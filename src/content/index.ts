import { z } from 'zod';
import bossJson from '../../content/tiers/tier-01/boss.json';
import bricksJson from '../../content/tiers/tier-01/bricks.json';
import exercisesJson from '../../content/tiers/tier-01/exercises.json';
import formulasJson from '../../content/tiers/tier-01/formulas.json';
import sentencesJson from '../../content/tiers/tier-01/sentences.json';
import tierJson from '../../content/tiers/tier-01/tier.json';
import trapsJson from '../../content/tiers/tier-01/traps.json';
import type { LessonContent } from '../core/exercise/types';
import {
  AuthoredExerciseSchema,
  BossSchema,
  BrickSchema,
  FormulaSchema,
  SentenceSchema,
  TierSchema,
  TrapSchema,
  type Brick,
} from './schema';

export const boss = BossSchema.parse(bossJson);
export const tier = TierSchema.parse(tierJson);
export const bricks = z.array(BrickSchema).parse(bricksJson);

export const lessonContent: LessonContent = {
  tier,
  bricks,
  sentences: z.array(SentenceSchema).parse(sentencesJson),
  formulas: z.array(FormulaSchema).parse(formulasJson),
  traps: z.array(TrapSchema).parse(trapsJson),
  exercises: z.array(AuthoredExerciseSchema).parse(exercisesJson),
};

const byId = new Map<string, Brick>(bricks.map((b) => [b.id, b]));

export function brick(id: string): Brick {
  const found = byId.get(id);
  if (!found) throw new Error(`Brique inconnue : ${id}`);
  return found;
}

export const bossClip = (variantId: string, slow = false) => `boss:${variantId}${slow ? ':slow' : ''}`;
export const sayClip = (voice: string, text: string) => `say:${voice}:${text}`;
export const steleClip = (tierId: string) => `stele:${tierId}`;
