import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  BOT_ACCURACY,
  MAX_SPEED,
  MIN_SPEED,
  NITRO_STREAK,
  RACE_MIN_QUESTIONS,
  RACE_SLOTS,
} from './config.js';
import {
  applyAnswer,
  createRace,
  currentQuestion,
  isTerminal,
  simulateBot,
  winnerOf,
} from './engine.js';

const questions = () =>
  Array.from({ length: RACE_MIN_QUESTIONS }, (_, index) => ({
    question_id: `race-question-${index}`,
    question_text: `Race question ${index}`,
  }));

/** @param {boolean[]} answers */
const finish = (answers) => {
  let state = createRace(questions(), () => 0.999999);
  for (const answer of answers) {
    if (isTerminal(state)) break;
    state = applyAnswer(state, answer);
  }
  return state;
};

describe('Pixel Car Racer pure engine', () => {
  it('keeps speed within 1..5 while applying the new speed to distance', () => {
    let state = createRace(questions(), () => 0.999999);
    state = applyAnswer({ ...state, speed: MAX_SPEED }, true);
    expect(state).toMatchObject({ speed: 5, distance: 50, points: 10 });
    state = applyAnswer({ ...state, speed: MIN_SPEED }, false);
    expect(state).toMatchObject({ speed: 1, distance: 60, points: 10 });
  });

  it('activates nitro only after the fourth consecutive correct answer', () => {
    let state = createRace(questions(), () => 0.999999);
    for (let index = 0; index < NITRO_STREAK; index += 1)
      state = applyAnswer(state, true);
    expect(state).toMatchObject({
      streak: 4,
      nitroActive: true,
      slotsUsed: 4,
      points: 40,
    });
    const boosted = applyAnswer(state, true);
    expect(boosted).toMatchObject({ slotsUsed: 6, points: 60 });
    expect(boosted.distance - state.distance).toBe(100);
  });

  it('uses seven answers for the specified four-correct then three-nitro run', () => {
    const state = finish([true, true, true, true, true, true, true]);
    expect(state).toMatchObject({
      status: 'finished',
      slotsUsed: 10,
      answersUsed: 7,
      points: 100,
    });
  });

  it('a wrong answer during nitro consumes one slot and ends streak and nitro', () => {
    let state = finish([true, true, true, true]);
    const beforeDistance = state.distance;
    state = applyAnswer(state, false);
    expect(state).toMatchObject({
      slotsUsed: 5,
      streak: 0,
      nitroActive: false,
      points: 40,
      speed: 4,
    });
    expect(state.distance - beforeDistance).toBe(40);
  });

  it('breaks result ties by distance, then points, then shares exact ties', () => {
    const base = finish(Array(RACE_SLOTS).fill(false));
    expect(
      winnerOf({ ...base, distance: 101 }, { ...base, distance: 100 }),
    ).toBe('player');
    expect(
      winnerOf(
        { ...base, distance: 100, points: 20 },
        { ...base, distance: 100, points: 10 },
      ),
    ).toBe('player');
    expect(winnerOf(base, structuredClone(base))).toBe('shared');
  });

  it('produces a deterministic labelled bot at the configured accuracy', () => {
    const first = simulateBot(questions(), 'fixed-bot');
    const second = simulateBot(questions(), 'fixed-bot');
    expect(first).toEqual(second);
    expect(first).toMatchObject({ name: 'Bot', status: 'finished' });
    expect(BOT_ACCURACY).toBe(0.6);
  });

  it('never repeats a served question even when nitro skips slots', () => {
    const state = finish([true, true, true, true, true, true, true]);
    expect(new Set(state.answeredQuestionIds).size).toBe(
      state.answeredQuestionIds.length,
    );
    expect(state.answeredQuestionIds).toHaveLength(7);
  });

  it('rejects moves after the race finishes without mutating state', () => {
    const state = finish(Array(RACE_SLOTS).fill(false));
    const snapshot = structuredClone(state);
    expect(isTerminal(state)).toBe(true);
    expect(currentQuestion(state)).toBeNull();
    expect(() => applyAnswer(state, true)).toThrow('PIXEL_RACER_FINISHED');
    expect(state).toEqual(snapshot);
  });

  it('refuses fewer than ten unique questions', () => {
    expect(() => createRace(questions().slice(0, 9), 'short')).toThrow(
      'PIXEL_RACER_NOT_ENOUGH_QUESTIONS',
    );
    expect(() =>
      createRace([...questions().slice(0, 9), questions()[0]], 'duplicate'),
    ).toThrow('PIXEL_RACER_NOT_ENOUGH_QUESTIONS');
  });

  it('preserves all state bounds and monotonic distance for random answers', () => {
    fc.assert(
      fc.property(
        fc.array(fc.boolean(), { minLength: 0, maxLength: 30 }),
        fc.integer(),
        (answers, seed) => {
          let state = createRace(questions(), seed);
          let previousDistance = 0;
          let previousPoints = 0;
          for (const answer of answers) {
            if (isTerminal(state)) {
              const snapshot = structuredClone(state);
              expect(() => applyAnswer(state, answer)).toThrow(
                'PIXEL_RACER_FINISHED',
              );
              expect(state).toEqual(snapshot);
              break;
            }
            state = applyAnswer(state, answer);
            expect(state.speed).toBeGreaterThanOrEqual(MIN_SPEED);
            expect(state.speed).toBeLessThanOrEqual(MAX_SPEED);
            expect(state.slotsUsed).toBeGreaterThanOrEqual(0);
            expect(state.slotsUsed).toBeLessThanOrEqual(RACE_SLOTS);
            expect(state.distance).toBeGreaterThanOrEqual(previousDistance);
            expect(state.points).toBeGreaterThanOrEqual(previousPoints);
            expect(state.points).toBeGreaterThanOrEqual(0);
            previousDistance = state.distance;
            previousPoints = state.points;
          }
        },
      ),
    );
  });
});
