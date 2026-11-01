import { z } from 'zod';
import { noProfanity, profanityMessage } from '../profanity/index.js';

/** @param {number} max */
const text = (max) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(noProfanity(), { message: profanityMessage });
/** @param {string} value */
const noPlaceholder = (value) =>
  !/^(question\s*\d+|tbd|lorem(?: ipsum)?)$/i.test(value.trim());

export const optionSchema = z
  .object({ optionText: text(500), isCorrect: z.boolean() })
  .strict();
export const authorQuestionSchema = z
  .object({
    questionId: z.string().uuid().optional(),
    questionType: z
      .enum(['multiple_choice', 'true_false', 'short_answer', 'code'])
      .default('multiple_choice'),
    questionText: text(2000).refine(noPlaceholder, {
      message: 'Question text must be meaningful.',
    }),
    topicId: z.string().uuid().nullable().optional(),
    topic: text(200).optional(),
    difficultyLevel: z.number().int().min(1).max(5),
    marks: z.number().positive().max(100),
    explanation: text(300).optional().nullable(),
    options: z.array(optionSchema).max(6).default([]),
    acceptedAnswers: z.array(text(500)).max(20).default([]),
    ignorePunctuation: z.boolean().default(false),
    codeLanguage: z.string().trim().max(40).optional().nullable(),
    codeBefore: z.string().max(2000).optional().nullable(),
    codeAfter: z.string().max(2000).optional().nullable(),
    expectedOutput: z.string().max(2000).optional().nullable(),
    displayOrder: z.number().int().min(0).default(0),
    source: z.enum(['manual', 'ai']).default('manual'),
  })
  .strict()
  .superRefine((question, ctx) => {
    if (
      question.questionType === 'multiple_choice' ||
      question.questionType === 'true_false' ||
      question.questionType === 'code'
    ) {
      if (question.options.length < 2 || question.options.length > 6)
        ctx.addIssue({
          code: 'custom',
          path: ['options'],
          message: 'Use 2 to 6 options.',
        });
      const normalized = question.options.map((option) =>
        option.optionText.trim().toLocaleLowerCase(),
      );
      if (new Set(normalized).size !== normalized.length)
        ctx.addIssue({
          code: 'custom',
          path: ['options'],
          message: 'Options must not be duplicated.',
        });
      if (question.options.filter((option) => option.isCorrect).length !== 1)
        ctx.addIssue({
          code: 'custom',
          path: ['options'],
          message: 'Exactly one option must be correct.',
        });
    }
    if (
      question.questionType === 'short_answer' &&
      question.acceptedAnswers.length < 1
    )
      ctx.addIssue({
        code: 'custom',
        path: ['acceptedAnswers'],
        message: 'Add at least one accepted answer.',
      });
    if (question.questionType === 'code') {
      for (const field of /** @type {const} */ ([
        'codeBefore',
        'codeAfter',
        'expectedOutput',
      ])) {
        const value = question[field];
        if (value && /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value))
          ctx.addIssue({
            code: 'custom',
            path: [field],
            message: 'Control characters are not allowed.',
          });
      }
    }
  });

export const authorQuizSchema = z
  .object({
    moduleId: z.string().uuid(),
    title: text(200).refine(noPlaceholder, {
      message: 'Quiz title must be meaningful.',
    }),
    isCompetitive: z.boolean().default(false),
    closesAt: z.string().datetime().nullable().optional(),
    status: z.enum(['draft', 'published']).default('draft'),
    questions: z.array(authorQuestionSchema).max(100).default([]),
  })
  .strict();

/** @param {any} quiz */
export function publishChecklist(quiz) {
  const parsed = authorQuizSchema.safeParse({ ...quiz, status: 'published' });
  if (!parsed.success) return { ok: false, issues: parsed.error.issues };
  if (!parsed.data.questions.length)
    return {
      ok: false,
      issues: [{ path: ['questions'], message: 'Add at least one question.' }],
    };
  return { ok: true, data: parsed.data };
}

/** @param {string} value @param {string[]} acceptedAnswers @param {boolean} [ignorePunctuation] */
export function matchesShortAnswer(
  value,
  acceptedAnswers,
  ignorePunctuation = false,
) {
  /** @param {unknown} input */
  const normalize = (input) => {
    let result = String(input || '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLocaleLowerCase();
    if (ignorePunctuation) result = result.replace(/[\p{P}\p{S}]/gu, '');
    return result;
  };
  const candidate = normalize(value);
  return (
    Boolean(candidate) &&
    acceptedAnswers.some((answer) => normalize(answer) === candidate)
  );
}

export function lineDiff(before = '', after = '') {
  const oldLines = String(before).replace(/\r\n/g, '\n').split('\n');
  const newLines = String(after).replace(/\r\n/g, '\n').split('\n');
  const result = [];
  const length = Math.max(oldLines.length, newLines.length);
  for (let index = 0; index < length; index += 1) {
    if (oldLines[index] === newLines[index])
      result.push({ kind: 'unchanged', text: oldLines[index] ?? '' });
    else {
      if (oldLines[index] !== undefined)
        result.push({ kind: 'removed', text: oldLines[index] });
      if (newLines[index] !== undefined)
        result.push({ kind: 'added', text: newLines[index] });
    }
  }
  return result;
}
