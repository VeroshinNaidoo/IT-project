import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  BOSS_DAMAGE,
  BOSS_MAX_HP,
  BOSS_MIN_QUESTIONS,
  PLAYER_DAMAGE,
  PLAYER_MAX_HP,
} from './config.js';
import {
  applyAnswer,
  createGame,
  currentQuestion,
  isTerminal,
} from './engine.js';

const questions = (levels = [1, 2, 3, 4, 5]) =>
  Array.from({ length: BOSS_MIN_QUESTIONS }, (_, index) => ({
    question_id: `question-${index}`,
    difficulty_level: levels[index % levels.length],
    question_text: `Question ${index}`,
  }));

/** @param {number} level */
const stateAtLevel = (level, overrides = {}) => ({
  ...createGame(questions([level]), () => 0.999999),
  ...overrides,
});

describe('Boss Battle pure engine', () => {
  it.each([
    [1, 'easy', true, 90, 100, 10],
    [2, 'easy', false, 100, 90, 0],
    [3, 'medium', true, 85, 100, 15],
    [3, 'medium', false, 100, 85, 0],
    [4, 'hard', true, 75, 100, 25],
    [5, 'hard', false, 100, 80, 0],
  ])(
    'applies level %s (%s), correct=%s',
    (level, _tier, correct, bossHp, playerHp, score) => {
      expect(applyAnswer(stateAtLevel(level), correct)).toMatchObject({
        bossHp,
        playerHp,
        score,
        status: 'in_progress',
      });
    },
  );

  it('clamps boss and player HP and awards only damage actually dealt', () => {
    expect(
      applyAnswer(stateAtLevel(5, { bossHp: 5, score: 40 }), true),
    ).toMatchObject({ bossHp: 0, playerHp: 100, score: 45, status: 'won' });
    expect(applyAnswer(stateAtLevel(5, { playerHp: 5 }), false)).toMatchObject({
      bossHp: 100,
      playerHp: 0,
      score: 0,
      status: 'lost',
    });
  });

  it('detects a win when boss HP reaches zero', () => {
    expect(applyAnswer(stateAtLevel(1, { bossHp: 10 }), true)).toMatchObject({
      bossHp: 0,
      status: 'won',
      score: 10,
    });
  });

  it('detects a loss when player HP reaches zero', () => {
    expect(applyAnswer(stateAtLevel(1, { playerHp: 10 }), false)).toMatchObject(
      { playerHp: 0, status: 'lost' },
    );
  });

  it('ends exhausted when the shuffled question list runs out first', () => {
    let state = createGame(questions([1]), () => 0.999999);
    for (let index = 0; index < BOSS_MIN_QUESTIONS; index += 1)
      state = applyAnswer(state, index % 2 === 0);
    expect(state).toMatchObject({
      bossHp: 40,
      playerHp: 40,
      score: 60,
      status: 'exhausted',
    });
    expect(currentQuestion(state)).toBeNull();
  });

  it('shuffles deterministically and never serves a question twice', () => {
    const left = createGame(questions(), 'fixed-seed');
    const right = createGame(questions(), 'fixed-seed');
    expect(left.questions.map((question) => question.question_id)).toEqual(
      right.questions.map((question) => question.question_id),
    );
    expect(
      new Set(left.questions.map((question) => question.question_id)).size,
    ).toBe(BOSS_MIN_QUESTIONS);
  });

  it('rejects every move after a terminal state without mutating it', () => {
    for (const status of ['won', 'lost', 'exhausted']) {
      const state = stateAtLevel(1, { status });
      const snapshot = structuredClone(state);
      expect(isTerminal(state)).toBe(true);
      expect(() => applyAnswer(state, true)).toThrow('BOSS_BATTLE_FINISHED');
      expect(state).toEqual(snapshot);
    }
  });

  it('refuses fewer than the minimum number of unique eligible questions', () => {
    expect(() =>
      createGame(questions().slice(0, BOSS_MIN_QUESTIONS - 1), 'short'),
    ).toThrow('BOSS_NOT_ENOUGH_QUESTIONS');
    expect(() =>
      createGame(
        [
          ...questions().slice(0, BOSS_MIN_QUESTIONS - 1),
          { question_id: 'question-0', difficulty_level: 3 },
        ],
        'duplicate',
      ),
    ).toThrow('BOSS_NOT_ENOUGH_QUESTIONS');
  });

  it('preserves bounded HP, monotonic score, terminal finality and uniqueness', () => {
    fc.assert(
      fc.property(
        fc.array(fc.boolean(), {
          minLength: 0,
          maxLength: BOSS_MIN_QUESTIONS * 2,
        }),
        fc.integer(),
        (answers, seed) => {
          let state = createGame(questions(), seed);
          const seen = new Set();
          let previousScore = state.score;
          for (const answer of answers) {
            if (isTerminal(state)) {
              const snapshot = structuredClone(state);
              expect(() => applyAnswer(state, answer)).toThrow(
                'BOSS_BATTLE_FINISHED',
              );
              expect(state).toEqual(snapshot);
              break;
            }
            const question = currentQuestion(state);
            expect(seen.has(question.question_id)).toBe(false);
            seen.add(question.question_id);
            state = applyAnswer(state, answer);
            expect(state.bossHp).toBeGreaterThanOrEqual(0);
            expect(state.bossHp).toBeLessThanOrEqual(BOSS_MAX_HP);
            expect(state.playerHp).toBeGreaterThanOrEqual(0);
            expect(state.playerHp).toBeLessThanOrEqual(PLAYER_MAX_HP);
            expect(state.score).toBeGreaterThanOrEqual(previousScore);
            previousScore = state.score;
          }
          expect(new Set(state.answeredQuestionIds).size).toBe(
            state.answeredQuestionIds.length,
          );
        },
      ),
    );
  });

  it('keeps all configured transition values in the expected tiers', () => {
    expect(BOSS_DAMAGE).toEqual({ easy: 10, medium: 15, hard: 25 });
    expect(PLAYER_DAMAGE).toEqual({ easy: 10, medium: 15, hard: 20 });
  });
});
