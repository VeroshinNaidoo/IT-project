import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { tierOf } from '../src/games/difficulty.js';
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
    [1, true, 50, 3, 10],
    [1, false, 35, 2, 0],
    [3, true, 60, 3, 20],
    [3, false, 30, 2, 0],
    [5, true, 70, 3, 30],
    [5, false, 25, 2, 0],
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
    expect(applyAnswer(initial({ cure: 5 }), 1, false)).toMatchObject({
      cure: 0,
      hearts: 2,
    });
    expect(applyAnswer(initial({ cure: 0 }), 5, false)).toMatchObject({
      cure: 0,
      hearts: 2,
    });
  });

  it.each([
    [80, 5],
    [90, 1],
  ])('clamps %s cure with a %s answer to a win', (cure, difficulty) => {
    expect(applyAnswer(initial({ cure }), difficulty, true)).toMatchObject({
      cure: 100,
      status: 'won',
    });
  });

  it('detects a loss at zero hearts', () => {
    expect(
      applyAnswer(initial({ cure: 60, hearts: 1 }), 3, false),
    ).toMatchObject({ hearts: 0, status: 'lost' });
  });

  it('does not accept a move after any terminal state', () => {
    for (const status of ['won', 'lost', 'exhausted']) {
      const state = initial({ status });
      expect(isTerminal(state)).toBe(true);
      expect(() => applyAnswer(state, 1, true)).toThrow(
        'GAME_SESSION_FINISHED',
      );
    }
  });

  it('selects one card per difficulty and never duplicates a question', () => {
    const questions = [
      { question_id: 'e1', difficulty_level: 1 },
      { question_id: 'e2', difficulty_level: 2 },
      { question_id: 'm1', difficulty_level: 3 },
      { question_id: 'h1', difficulty_level: 5 },
    ];
    const cards = selectCards(questions, () => 0);
    expect(cards.map((card) => tierOf(card.difficulty_level)).sort()).toEqual([
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
          { question_id: 'e1', difficulty_level: 1 },
          { question_id: 'e2', difficulty_level: 2 },
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
            difficulty: fc.integer({ min: 1, max: 5 }),
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
