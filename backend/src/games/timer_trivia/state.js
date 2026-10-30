import { z } from 'zod';
import { registerGameStateSchema } from '../play-state.js';
import { TRIVIA_ROUNDS } from './config.js';

export const TIMER_TRIVIA_STATE_VERSION = 1;

const questionSchema = z
  .object({
    question_id: z.string().uuid(),
    difficulty_level: z.number().int().min(1).max(5),
    topic_name: z.string().min(1),
  })
  .strict();
const cellSchema = z
  .object({
    cellId: z.string().min(1),
    topic: z.string().min(1),
    level: z.number().int().min(1).max(5),
    points: z.number().int().min(10).max(50),
    question: questionSchema,
    state: z.enum(['open', 'answered']),
  })
  .strict();

export const timerTriviaStateSchema = z
  .object({
    version: z.literal(TIMER_TRIVIA_STATE_VERSION),
    status: z.enum(['in_progress', 'finished']),
    score: z.number().int().nonnegative(),
    roundsCompleted: z.number().int().min(0).max(TRIVIA_ROUNDS),
    topics: z.array(z.string().min(1)).min(1).max(5),
    cells: z.array(cellSchema).min(TRIVIA_ROUNDS).max(25),
    currentCellId: z.string().min(1).nullable(),
    questionStartedAt: z.string().datetime().nullable(),
    deadlineAt: z.string().datetime().nullable(),
    extendedTime: z.boolean(),
    answeredQuestionIds: z.array(z.string().uuid()),
    lastResult: z
      .object({
        cellId: z.string().min(1),
        questionId: z.string().uuid(),
        isCorrect: z.boolean(),
        timedOut: z.boolean(),
        pointsDelta: z.number().int().min(0).max(50),
        answeredAt: z.string().datetime(),
      })
      .strict()
      .optional(),
    serverSeed: z.string().min(1),
    startedAt: z.string().datetime(),
  })
  .strict()
  .superRefine((state, context) => {
    const questionIds = state.cells.map((cell) => cell.question.question_id);
    if (new Set(questionIds).size !== questionIds.length)
      context.addIssue({
        code: 'custom',
        path: ['cells'],
        message: 'board questions must be unique',
      });
    if (state.answeredQuestionIds.length !== state.roundsCompleted)
      context.addIssue({
        code: 'custom',
        path: ['answeredQuestionIds'],
        message: 'answered questions must match completed rounds',
      });
    const activeFields = [
      state.currentCellId,
      state.questionStartedAt,
      state.deadlineAt,
    ];
    if (activeFields.some(Boolean) && !activeFields.every(Boolean))
      context.addIssue({
        code: 'custom',
        path: ['currentCellId'],
        message: 'active round timing must be complete',
      });
    if (state.status === 'finished' && state.roundsCompleted !== TRIVIA_ROUNDS)
      context.addIssue({
        code: 'custom',
        path: ['roundsCompleted'],
        message: 'finished trivia must complete every round',
      });
  });

registerGameStateSchema('timer_trivia', timerTriviaStateSchema);
