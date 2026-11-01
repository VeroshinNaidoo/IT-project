import { describe, expect, it } from 'vitest';
import {
  authorQuestionSchema,
  authorQuizSchema,
  lineDiff,
  matchesShortAnswer,
  publishChecklist,
} from './validation.js';

const mc = (overrides = {}) => ({
  questionType: 'multiple_choice',
  questionText: 'Which value is correct?',
  marks: 1,
  difficultyLevel: 3,
  options: [
    { optionText: 'A', isCorrect: true },
    { optionText: 'B', isCorrect: false },
  ],
  ...overrides,
});

describe('manual quiz validation', () => {
  it('accepts multiple choice and true/false with one correct option', () => {
    expect(authorQuestionSchema.safeParse(mc()).success).toBe(true);
    expect(
      authorQuestionSchema.safeParse(
        mc({
          questionType: 'true_false',
          options: [
            { optionText: 'True', isCorrect: true },
            { optionText: 'False', isCorrect: false },
          ],
        }),
      ).success,
    ).toBe(true);
  });
  it('rejects duplicate options and multiple correct options', () => {
    expect(
      authorQuestionSchema.safeParse(
        mc({
          options: [
            { optionText: 'A', isCorrect: true },
            { optionText: 'a', isCorrect: false },
          ],
        }),
      ).success,
    ).toBe(false);
    expect(
      authorQuestionSchema.safeParse(
        mc({
          options: [
            { optionText: 'A', isCorrect: true },
            { optionText: 'B', isCorrect: true },
          ],
        }),
      ).success,
    ).toBe(false);
  });
  it('validates short answers and matches case, spacing and punctuation rules', () => {
    expect(
      authorQuestionSchema.safeParse(
        mc({
          questionType: 'short_answer',
          options: [],
          acceptedAnswers: ['Cape Town'],
        }),
      ).success,
    ).toBe(true);
    expect(matchesShortAnswer('  CAPE   TOWN ', ['Cape Town'])).toBe(true);
    expect(matchesShortAnswer('Cape, Town', ['Cape Town'], true)).toBe(true);
    expect(matchesShortAnswer('', ['Cape Town'])).toBe(false);
  });
  it('validates code questions and rejects oversized snippets', () => {
    expect(
      authorQuestionSchema.safeParse(
        mc({
          questionType: 'code',
          codeBefore: '<p>before</p>',
          codeAfter: '<p>after</p>',
        }),
      ).success,
    ).toBe(true);
    expect(
      authorQuestionSchema.safeParse(
        mc({ questionType: 'code', options: [], codeBefore: 'x'.repeat(2001) }),
      ).success,
    ).toBe(false);
  });
  it('blocks placeholder publishing and empty quizzes', () => {
    expect(
      publishChecklist({
        moduleId: '00000000-0000-0000-0000-000000000000',
        title: 'Question 1',
        questions: [mc()],
      }).ok,
    ).toBe(false);
    expect(
      publishChecklist({
        moduleId: '00000000-0000-0000-0000-000000000000',
        title: 'A real quiz',
        questions: [],
      }).ok,
    ).toBe(false);
    expect(
      authorQuizSchema.safeParse({
        moduleId: '00000000-0000-0000-0000-000000000000',
        title: 'A real quiz',
        questions: [mc()],
      }).success,
    ).toBe(true);
  });
  it('creates an escaped line diff for added, removed and unchanged lines', () => {
    expect(lineDiff('a\nb', 'a\nc')).toEqual([
      { kind: 'unchanged', text: 'a' },
      { kind: 'removed', text: 'b' },
      { kind: 'added', text: 'c' },
    ]);
    expect(lineDiff('', '')[0]).toEqual({ kind: 'unchanged', text: '' });
    expect(lineDiff('long'.repeat(100), 'new')).toHaveLength(2);
  });
});
