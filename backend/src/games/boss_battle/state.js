import { z } from 'zod';
import { registerGameStateSchema } from '../play-state.js';
import { BOSS_MAX_HP, BOSS_MIN_QUESTIONS, PLAYER_MAX_HP } from './config.js';

export const BOSS_STATE_VERSION = 1;

const bossQuestionSchema = z
  .object({
    question_id: z.string().uuid(),
    difficulty_level: z.number().int().min(1).max(5),
  })
  .strict();

export const bossBattleStateSchema = z
  .object({
    version: z.literal(BOSS_STATE_VERSION),
    bossHp: z.number().int().min(0).max(BOSS_MAX_HP),
    playerHp: z.number().int().min(0).max(PLAYER_MAX_HP),
    score: z.number().int().nonnegative(),
    status: z.enum(['in_progress', 'won', 'lost', 'exhausted']),
    questions: z.array(bossQuestionSchema).min(BOSS_MIN_QUESTIONS),
    questionIndex: z.number().int().nonnegative(),
    answeredQuestionIds: z.array(z.string().uuid()),
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
        message: 'questions must be unique',
      });
    if (state.questionIndex > state.questions.length)
      context.addIssue({
        code: 'custom',
        path: ['questionIndex'],
        message: 'question index is outside the shuffled list',
      });
    if (state.answeredQuestionIds.length !== state.questionIndex)
      context.addIssue({
        code: 'custom',
        path: ['answeredQuestionIds'],
        message: 'answered questions must match progress',
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
    if (state.status === 'won' && state.bossHp !== 0)
      context.addIssue({
        code: 'custom',
        path: ['bossHp'],
        message: 'a won play requires zero boss HP',
      });
    if (state.status === 'lost' && state.playerHp !== 0)
      context.addIssue({
        code: 'custom',
        path: ['playerHp'],
        message: 'a lost play requires zero player HP',
      });
    if (
      state.status === 'exhausted' &&
      state.questionIndex !== state.questions.length
    )
      context.addIssue({
        code: 'custom',
        path: ['questionIndex'],
        message: 'an exhausted play requires every question to be used',
      });
  });

registerGameStateSchema('boss_battle', bossBattleStateSchema);
