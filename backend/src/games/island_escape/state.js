import { z } from 'zod';
import { registerGameStateSchema } from '../play-state.js';
import {
  ISLAND_MAX_SETBACKS,
  ISLAND_PHASE_COUNT,
  ISLAND_QUESTIONS_PER_PHASE,
  ISLAND_STATE_VERSION,
  ISLAND_STREAK_FOR_DOUBLE,
  ISLAND_WRONG_LIMIT,
} from './config.js';

export const islandStateSchema = z
  .object({
    version: z.literal(ISLAND_STATE_VERSION),
    phase: z.number().int().min(1).max(ISLAND_PHASE_COUNT),
    phaseAttempt: z.number().int().positive(),
    phaseQuestionNumber: z
      .number()
      .int()
      .min(0)
      .max(ISLAND_QUESTIONS_PER_PHASE),
    wrongInPhase: z
      .number()
      .int()
      .min(0)
      .max(ISLAND_WRONG_LIMIT - 1),
    streak: z.number().int().nonnegative(),
    doubleActive: z.boolean(),
    setbacks: z
      .number()
      .int()
      .min(0)
      .max(ISLAND_MAX_SETBACKS + 1),
    score: z.number().int().nonnegative(),
    materials: z.array(z.string()),
    boatParts: z.array(z.string()),
    sailProgress: z.number().int().nonnegative(),
    askedQuestionIds: z.array(z.string().uuid()),
    phaseQuestionIds: z.array(z.string().uuid()),
    currentQuestionId: z.string().uuid().nullable(),
    status: z.enum(['in_progress', 'won', 'lost', 'exhausted']),
    lastEvent: z.string(),
    pointsEarned: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((state, context) => {
    if (state.doubleActive && state.streak < ISLAND_STREAK_FOR_DOUBLE)
      context.addIssue({
        code: 'custom',
        path: ['doubleActive'],
        message: 'doubling requires the configured streak',
      });
    if (state.setbacks === ISLAND_MAX_SETBACKS + 1 && state.status !== 'lost')
      context.addIssue({
        code: 'custom',
        path: ['status'],
        message: 'the fourth setback must end the play',
      });
  });

registerGameStateSchema('island_escape', islandStateSchema);
