import { z } from 'zod';

const elementRef = z.string().regex(/^(b|f|t)\./);

export const BrickSchema = z.object({
  id: z.string().regex(/^b\./),
  en: z.string().min(1),
  fr: z.array(z.string().min(1)).min(1),
  kind: z.enum(['word', 'chunk', 'tool', 'proper']),
  tracked: z.boolean(),
  nodeId: z.string(),
  ownerFormula: z.string().optional(),
  confusableWith: z.array(z.string()),
  note: z.string().optional(),
  ssmlOverride: z.string().optional(),
});

export const BossVariantSchema = z.object({
  id: z.string().regex(/^v\.\d+\.\d{2}\.[a-z]$/),
  audio: z.string().min(1),
  fr: z.string().min(1),
  tokens: z.array(z.string()).min(1),
  distractors: z.array(z.string()).min(1),
  pivotAlternatives: z.array(z.string()).min(1),
  pivotElements: z.array(elementRef).min(1),
  aRetenir: z.string().min(1),
  ssmlOverride: z.string().optional(),
  riposte: z
    .object({
      question: z.string().min(1),
      options: z
        .array(z.object({ text: z.string().min(1), correct: z.boolean(), blame: elementRef.optional() }))
        .length(3),
    })
    .optional(),
});

export const BossSchema = z.object({
  id: z.string(),
  tierId: z.string(),
  title: z.string(),
  allowedErrors: z.number().int().positive(),
  replaysPerRank: z.number().int().nonnegative(),
  slowTokens: z.number().int().nonnegative(),
  ranks: z.array(z.object({ order: z.number().int().positive(), variants: z.array(BossVariantSchema).min(2) })),
});

export const NodeSchema = z.object({
  id: z.string().regex(/^n\.\d+\.\d{2}$/),
  kind: z.enum(['vein', 'formula', 'boss']),
  title: z.string(),
  intro: z.string().optional(),
  brickIds: z.array(z.string()).optional(),
  trapIds: z.array(z.string()).optional(),
  formulaId: z.string().optional(),
  districtId: z.string().optional(), // absent pour le chemin du Port
});

export const TierSchema = z.object({
  id: z.string(),
  order: z.number().int().positive(),
  title: z.string(),
  bossId: z.string(),
  soundTestBrickId: z.string(),
  stele: z.object({ en: z.string(), fr: z.string() }),
  texts: z.object({
    firstLaunch: z.string(),
    comeback: z.string(),
    anteroom: z.string(),
    firstEntry: z.string(),
    defeat: z.string(),
    victory: z.string(),
  }),
  nodes: z.array(NodeSchema),
});

export const ReuseSchema = z.object({
  element: z.string().regex(/^(b|f)\./), // la brique ou la formule du Port à maîtriser
  word: z.string().min(1), // le mot à mettre en valeur dans les deux phrases
  how: z.string().min(1),
  beforeSentenceId: z.string(),
  afterSentenceId: z.string(),
});

export const DistrictSchema = z.object({
  id: z.string().regex(/^d\./),
  title: z.string(),
  promise: z.string().min(1), // ce que le joueur saura faire en vrai
  reuses: z.array(ReuseSchema),
  nodes: z.array(NodeSchema),
});

export const CitySchema = z.object({
  id: z.string(),
  order: z.number().int().positive(),
  title: z.string(),
  intro: z.string(),
  districts: z.array(DistrictSchema).min(1),
});

export const SentenceSchema = z.object({
  id: z.string().regex(/^s\./),
  en: z.string().min(1),
  fr: z.string().min(1),
  acceptedEn: z.array(z.string()),
  bricks: z.array(z.string()).min(1),
  formulaIds: z.array(z.string()),
  minNodeId: z.string(),
  guardianAudio: z.boolean(),
  ssmlOverride: z.string().optional(),
});

export const ErrorPatternSchema = z.object({
  id: z.string(),
  match: z.string(),
  onlyIfQuestion: z.boolean().optional(),
  pourquoi: z.string().min(1),
  aRetenir: z.string().min(1),
  blame: elementRef,
});

export const ExerciseRefSchema = z.object({
  type: z.enum(['E5', 'E6', 'E8', 'E9', 'E10']),
  id: z.string(),
});

export const FormulaSchema = z.object({
  id: z.string().regex(/^f\./),
  title: z.string(),
  pattern: z.string(),
  ruleText: z.string().min(1),
  clueSentenceIds: z.array(z.string()).length(4),
  hypothesis: z.object({
    question: z.string(),
    options: z.array(z.object({ text: z.string(), correct: z.boolean(), why: z.string().min(1) })).length(3),
  }),
  trial: z.object({ passMin: z.number().int().positive(), positions: z.array(z.array(ExerciseRefSchema).min(1)).length(6) }),
  errorPatterns: z.array(ErrorPatternSchema),
});

export const TrapSchema = z.object({
  id: z.string().regex(/^t\./),
  title: z.string(),
  kind: z.enum(['false_friend', 'calque']),
  fr: z.string(),
  en: z.string(),
  lesson: z.string().min(1),
  exerciseIds: z.array(z.string()).min(1),
  linkedSentenceId: z.string().optional(),
});

const OptionSchema = z.object({
  text: z.string().min(1),
  correct: z.boolean(),
  pourquoi: z.string().optional(),
  aRetenir: z.string().optional(),
});

export const AuthoredExerciseSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('E9'),
    id: z.string(),
    targets: z.array(elementRef).min(1),
    prompt: z.string(),
    audioText: z.string(),
    options: z.array(OptionSchema).length(3),
  }),
  z.object({
    type: z.literal('E10'),
    id: z.string(),
    targets: z.array(elementRef).min(1),
    minNodeId: z.string(),
    tokens: z.array(z.string()).min(2),
    wrongIndex: z.number().int().nonnegative(),
    replacements: z.array(z.string()).length(3),
    correct: z.string(),
    pourquoi: z.string().min(1),
    aRetenir: z.string().min(1),
    audioText: z.string(),
  }),
  z.object({
    type: z.literal('E11'),
    id: z.string(),
    targets: z.array(elementRef).min(1),
    minNodeId: z.string(),
    prompt: z.string(),
    audioSentenceId: z.string(),
    options: z.array(OptionSchema).length(3),
  }),
]);

export type Brick = z.infer<typeof BrickSchema>;
export type BossVariant = z.infer<typeof BossVariantSchema>;
export type Boss = z.infer<typeof BossSchema>;
export type Tier = z.infer<typeof TierSchema>;
export type TierNode = z.infer<typeof NodeSchema>;
export type Reuse = z.infer<typeof ReuseSchema>;
export type District = z.infer<typeof DistrictSchema>;
export type City = z.infer<typeof CitySchema>;
export type Sentence = z.infer<typeof SentenceSchema>;
export type Formula = z.infer<typeof FormulaSchema>;
export type Trap = z.infer<typeof TrapSchema>;
export type AuthoredExercise = z.infer<typeof AuthoredExerciseSchema>;
export type ErrorPattern = z.infer<typeof ErrorPatternSchema>;
