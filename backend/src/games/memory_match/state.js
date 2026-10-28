import { z } from 'zod';
import { registerGameStateSchema } from '../play-state.js';
import { MEMORY_STATE_VERSION } from './config.js';

export const memoryMatchStateSchema = z.object({
  version: z.literal(MEMORY_STATE_VERSION),
  cards: z
    .array(
      z.object({
        cardId: z.string().uuid(),
        kind: z.enum(['question', 'answer']),
        questionId: z.string().uuid(),
        pairKey: z.string().uuid(),
        text: z.string().min(1),
        faceUp: z.boolean(),
        matched: z.boolean(),
      }),
    )
    .min(1),
  matchedPairs: z.number().int().nonnegative(),
  mismatches: z.number().int().nonnegative(),
  moves: z.number().int().nonnegative(),
  score: z.number().int().nonnegative(),
  status: z.enum(['in_progress', 'finished']),
  serverSeed: z.string().min(1),
  startedAt: z.string().datetime(),
});

registerGameStateSchema('memory_match', memoryMatchStateSchema);
