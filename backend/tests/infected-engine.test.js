import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  applyAnswer,
  finalizeIfExhausted,
  isTerminal,
  selectCards,
} from '../src/games/infected/engine.js';

const initial = (overrides = {}) => ({
  cure: 40,
  hearts: 3,
  score: 0,
  status: 'in_progress',
  ...overrides,
});

describe('Infected pure engine', () => {
  it.each([
    ['easy', true, 50, 3, 10],
    ['easy', false, 35, 2, 0],
    ['medium', true, 60, 3, 20],
    ['medium', false, 30, 2, 0],
    ['hard', true, 70, 3, 30],
    ['hard', false, 25, 2, 0],
  ])(
    'applies the %s/%s transition',
    (difficulty, correct, cure, hearts, score) => {
      expect(applyAnswer(initial(), difficulty, correct)).toEqual({
        cure,
        hearts,
        score,
        status: 'in_progress',
      });
    },
  );

  it('clamps an Easy wrong answer at zero and still removes a heart', () => {
    expect(applyAnswer(initial({ cure: 5 }), 'easy', false)).toMatchObject({
      cure: 0,
      hearts: 2,
    });
    expect(applyAnswer(initial({ cure: 0 }), 'hard', false)).toMatchObject({
      cure: 0,
      hearts: 2,
    });
  });

  it.each([
    [80, 'hard'],
    [90, 'easy'],
  ])('clamps %s cure with a %s answer to a win', (cure, difficulty) => {
    expect(applyAnswer(initial({ cure }), difficulty, true)).toMatchObject({
      cure: 100,
      status: 'won',
    });
  });

  it('detects a loss at zero hearts', () => {
    expect(
      applyAnswer(initial({ cure: 60, hearts: 1 }), 'medium', false),
    ).toMatchObject({ hearts: 0, status: 'lost' });
  });

  it('does not accept a move after any terminal state', () => {
    for (const status of ['won', 'lost', 'exhausted']) {
      const state = initial({ status });
      expect(isTerminal(state)).toBe(true);
      expect(() => applyAnswer(state, 'easy', true)).toThrow(
        'GAME_SESSION_FINISHED',
      );
    }
  });

  it('selects one card per difficulty and never duplicates a question', () => {
    const questions = [
      { question_id: 'e1', difficulty: 'easy' },
      { question_id: 'e2', difficulty: 'easy' },
      { question_id: 'm1', difficulty: 'medium' },
      { question_id: 'h1', difficulty: 'hard' },
    ];
    const cards = selectCards(questions, () => 0);
    expect(cards.map((card) => card.difficulty).sort()).toEqual([
      'easy',
      'hard',
      'medium',
    ]);
    expect(new Set(cards.map((card) => card.question_id)).size).toBe(3);
  });

  it('fills missing difficulty slots and returns fewer than three at exhaustion', () => {
    expect(
      selectCards(
        [
          { question_id: 'e1', difficulty: 'easy' },
          { question_id: 'e2', difficulty: 'easy' },
        ],
        () => 0,
      ),
    ).toHaveLength(2);
    expect(finalizeIfExhausted(initial(), [])).toMatchObject({
      status: 'exhausted',
      cure: 40,
      score: 0,
    });
  });

  it('preserves all state bounds for arbitrary answer sequences', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            difficulty: fc.constantFrom('easy', 'medium', 'hard'),
            correct: fc.boolean(),
          }),
          { maxLength: 100 },
        ),
        (moves) => {
          let state = initial({ cure: 0 });
          let previousScore = state.score;
          for (const move of moves) {
            if (isTerminal(state)) {
              expect(() =>
                applyAnswer(state, move.difficulty, move.correct),
              ).toThrow('GAME_SESSION_FINISHED');
              break;
            }
            state = applyAnswer(state, move.difficulty, move.correct);
            expect(state.cure).toBeGreaterThanOrEqual(0);
            expect(state.cure).toBeLessThanOrEqual(100);
            expect(state.hearts).toBeGreaterThanOrEqual(0);
            expect(state.hearts).toBeLessThanOrEqual(3);
            expect(state.score).toBeGreaterThanOrEqual(previousScore);
            previousScore = state.score;
          }
        },
      ),
    );
  });
});
