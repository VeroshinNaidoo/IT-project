import { z } from 'zod';
import { registerGameStateSchema } from '../play-state.js';
import {
  MAX_SPEED,
  MIN_SPEED,
  RACE_MIN_QUESTIONS,
  RACE_SLOTS,
} from './config.js';

export const PIXEL_RACER_STATE_VERSION = 1;

const questionSchema = z.object({ question_id: z.string().uuid() }).strict();

const racerSchema = z
  .object({
    status: z.literal('finished'),
    slotsUsed: z.literal(RACE_SLOTS),
    answersUsed: z.number().int().positive(),
    speed: z.number().int().min(MIN_SPEED).max(MAX_SPEED),
    distance: z.number().int().nonnegative(),
    streak: z.number().int().nonnegative(),
    points: z.number().int().nonnegative(),
    nitroActive: z.boolean(),
    answeredQuestionIds: z.array(z.string().uuid()),
    name: z.literal('Bot'),
  })
  .strict();

export const pixelRacerStateSchema = z
  .object({
    version: z.literal(PIXEL_RACER_STATE_VERSION),
    status: z.enum(['in_progress', 'finished']),
    questions: z.array(questionSchema).length(RACE_MIN_QUESTIONS),
    slotsUsed: z.number().int().min(0).max(RACE_SLOTS),
    answersUsed: z.number().int().min(0).max(RACE_SLOTS),
    speed: z.number().int().min(MIN_SPEED).max(MAX_SPEED),
    distance: z.number().int().nonnegative(),
    streak: z.number().int().nonnegative(),
    points: z.number().int().nonnegative(),
    nitroActive: z.boolean(),
    answeredQuestionIds: z.array(z.string().uuid()),
    bot: racerSchema,
    serverSeed: z.string().min(1),
    startedAt: z.string().datetime(),
  })
  .strict()
  .superRefine((state, context) => {
    const questionIds = state.questions.map((question) => question.question_id);
    if (new Set(questionIds).size !== questionIds.length)
      context.addIssue({
        code: 'custom',
        path: ['questions'],
        message: 'race questions must be unique',
      });
    if (state.answeredQuestionIds.length !== state.answersUsed)
      context.addIssue({
        code: 'custom',
        path: ['answeredQuestionIds'],
        message: 'answered questions must match answers used',
      });
    if (
      new Set(state.answeredQuestionIds).size !==
      state.answeredQuestionIds.length
    )
      context.addIssue({
        code: 'custom',
        path: ['answeredQuestionIds'],
        message: 'answered questions must be unique',
      });
    if (state.nitroActive && state.streak < 4)
      context.addIssue({
        code: 'custom',
        path: ['nitroActive'],
        message: 'nitro requires a streak of four',
      });
    if (state.status === 'finished' && state.slotsUsed !== RACE_SLOTS)
      context.addIssue({
        code: 'custom',
        path: ['slotsUsed'],
        message: 'a finished race must consume every slot',
      });
    if (state.status === 'in_progress' && state.slotsUsed >= RACE_SLOTS)
      context.addIssue({
        code: 'custom',
        path: ['slotsUsed'],
        message: 'an active race must have a remaining slot',
      });
  });

registerGameStateSchema('pixel_racer', pixelRacerStateSchema);
