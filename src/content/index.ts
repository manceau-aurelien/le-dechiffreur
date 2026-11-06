import { z } from 'zod';
import bossJson from '../../content/tiers/tier-01/boss.json';
import bricksJson from '../../content/tiers/tier-01/bricks.json';
import exercisesJson from '../../content/tiers/tier-01/exercises.json';
import formulasJson from '../../content/tiers/tier-01/formulas.json';
import sentencesJson from '../../content/tiers/tier-01/sentences.json';
import tierJson from '../../content/tiers/tier-01/tier.json';
import trapsJson from '../../content/tiers/tier-01/traps.json';
import cityBricksJson from '../../content/tiers/tier-02/bricks.json';
import cityJson from '../../content/tiers/tier-02/city.json';
import cityExercisesJson from '../../content/tiers/tier-02/exercises.json';
import cityFormulasJson from '../../content/tiers/tier-02/formulas.json';
import citySentencesJson from '../../content/tiers/tier-02/sentences.json';
import cityTrapsJson from '../../content/tiers/tier-02/traps.json';
import type { LessonContent } from '../core/exercise/types';
import { mergeTier } from './merge';
import {
  AuthoredExerciseSchema,
  BossSchema,
  BrickSchema,
  CitySchema,
  FormulaSchema,
  SentenceSchema,
  TierSchema,
  TrapSchema,
  type Brick,
} from './schema';

export const boss = BossSchema.parse(bossJson);
export const tier = TierSchema.parse(tierJson);
export const city = CitySchema.parse(cityJson);
export const bricks = z.array(BrickSchema).parse([...bricksJson, ...cityBricksJson]);

export const lessonContent: LessonContent = {
  tier: mergeTier(tier, city),
  bricks,
  sentences: z.array(SentenceSchema).parse([...sentencesJson, ...citySentencesJson]),
  formulas: z.array(FormulaSchema).parse([...formulasJson, ...cityFormulasJson]),
  traps: z.array(TrapSchema).parse([...trapsJson, ...cityTrapsJson]),
  exercises: z.array(AuthoredExerciseSchema).parse([...exercisesJson, ...cityExercisesJson]),
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
