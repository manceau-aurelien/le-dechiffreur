import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import {
  AuthoredExerciseSchema,
  BossSchema,
  BrickSchema,
  FormulaSchema,
  SentenceSchema,
  TierSchema,
  TrapSchema,
  type AuthoredExercise,
  type Boss,
  type Brick,
  type Formula,
  type Sentence,
  type Tier,
  type Trap,
} from '../src/content/schema.ts';

export const TIER_DIR = join('content', 'tiers', 'tier-01');
const read = (name: string) => JSON.parse(readFileSync(join(TIER_DIR, name), 'utf8'));

export interface Content {
  tier: Tier;
  bricks: Brick[];
  boss: Boss;
  sentences: Sentence[];
  formulas: Formula[];
  traps: Trap[];
  exercises: AuthoredExercise[];
}

export function loadContent(): Content {
  return {
    tier: TierSchema.parse(read('tier.json')),
    bricks: z.array(BrickSchema).parse(read('bricks.json')),
    boss: BossSchema.parse(read('boss.json')),
    sentences: z.array(SentenceSchema).parse(read('sentences.json')),
    formulas: z.array(FormulaSchema).parse(read('formulas.json')),
    traps: z.array(TrapSchema).parse(read('traps.json')),
    exercises: z.array(AuthoredExerciseSchema).parse(read('exercises.json')),
  };
}

export const words = (s: string) =>
  s
    .replace(/[.,?!]/g, '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

export interface ClipRequest {
  clipId: string;
  text: string;
  voice: string;
  slow: boolean;
  ssmlOverride?: string;
}

const LESSON_VOICES = ['voiceA', 'voiceB'];

/** Liste de tous les clips du palier. Une même réplique dans une même voix n'est produite qu'une fois. */
export function listClips({ tier, bricks, boss, sentences, exercises }: Content): ClipRequest[] {
  const clips = new Map<string, ClipRequest>();
  const add = (clip: ClipRequest) => {
    if (!clips.has(clip.clipId)) clips.set(clip.clipId, clip);
  };
  const say = (voice: string, text: string, ssmlOverride?: string) =>
    add({ clipId: `say:${voice}:${text}`, text, voice, slow: false, ssmlOverride });

  for (const rank of boss.ranks) {
    for (const v of rank.variants) {
      add({ clipId: `boss:${v.id}`, text: v.audio, voice: 'guardian', slow: false, ssmlOverride: v.ssmlOverride });
      add({ clipId: `boss:${v.id}:slow`, text: v.audio, voice: 'guardian', slow: true, ssmlOverride: v.ssmlOverride });
    }
  }
  add({ clipId: `stele:${tier.id}`, text: tier.stele.en, voice: 'anna', slow: false });
  for (const voice of LESSON_VOICES) {
    for (const b of bricks) say(voice, b.en, b.ssmlOverride);
    for (const s of sentences) say(voice, s.en, s.ssmlOverride);
    for (const e of exercises) if (e.type !== 'E11') say(voice, e.audioText);
  }
  for (const s of sentences) if (s.guardianAudio) say('guardian', s.en, s.ssmlOverride);
  return [...clips.values()];
}
