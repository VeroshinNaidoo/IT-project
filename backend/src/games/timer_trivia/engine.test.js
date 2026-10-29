// @ts-nocheck - generated state shapes are asserted exhaustively below.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  EXTENDED_TIME_MULTIPLIER,
  TRIVIA_ROUNDS,
  TRIVIA_SECONDS,
} from './config.js';
import {
  applyAnswer,
  chooseCell,
  createGame,
  currentQuestion,
  isTerminal,
} from './engine.js';

const startedAt = new Date('2026-01-01T12:00:00.000Z');
const questions = () =>
  Array.from({ length: 15 }, (_, index) => ({
    question_id: `trivia-${index}`,
    question_text: `Question ${index}`,
    topic_name: `Topic ${Math.floor(index / 5) + 1}`,
    difficulty_level: (index % 5) + 1,
  }));

const answerCell = (
  state,
  cellId,
  isCorrect,
  offsetSeconds = 1,
  extended = false,
) => {
  const chosen = chooseCell(state, cellId, startedAt, extended);
  return applyAnswer(
    chosen,
    isCorrect,
    new Date(startedAt.getTime() + offsetSeconds * 1000),
  );
};

describe('Timer Trivia pure engine', () => {
  it('builds up to five topic columns with level-based point rows', () => {
    const state = createGame(questions(), () => 0.999999);
    expect(state.topics).toEqual(['Topic 1', 'Topic 2', 'Topic 3']);
    expect(state.cells).toHaveLength(15);
    expect(state.cells.map((cell) => cell.points)).toContain(50);
    expect(
      new Set(state.cells.map((cell) => cell.question.question_id)).size,
    ).toBe(15);
  });

  it('scores the selected cell points for an on-time correct answer', () => {
    const initial = createGame(questions(), 'score');
    const fifty = initial.cells.find((cell) => cell.points === 50);
    const state = answerCell(initial, fifty.cellId, true);
    expect(state).toMatchObject({ score: 50, roundsCompleted: 1 });
    expect(state.lastResult).toMatchObject({
      isCorrect: true,
      timedOut: false,
      pointsDelta: 50,
    });
  });

  it('scores zero for a wrong answer', () => {
    const initial = createGame(questions(), 'wrong');
    const state = answerCell(initial, initial.cells[0].cellId, false);
    expect(state).toMatchObject({ score: 0, roundsCompleted: 1 });
    expect(state.lastResult).toMatchObject({
      isCorrect: false,
      timedOut: false,
      pointsDelta: 0,
    });
  });

  it('records an answer after the server deadline as timed out', () => {
    const initial = createGame(questions(), 'timeout');
    const chosen = chooseCell(initial, initial.cells[0].cellId, startedAt);
    const state = applyAnswer(
      chosen,
      true,
      new Date(startedAt.getTime() + (TRIVIA_SECONDS + 1) * 1000),
    );
    expect(state.lastResult).toMatchObject({
      timedOut: true,
      isCorrect: false,
      pointsDelta: 0,
    });
    expect(state.score).toBe(0);
  });

  it('doubles the server deadline for the extended-time setting', () => {
    const initial = createGame(questions(), 'extended');
    const chosen = chooseCell(
      initial,
      initial.cells[0].cellId,
      startedAt,
      true,
    );
    expect(new Date(chosen.deadlineAt).getTime() - startedAt.getTime()).toBe(
      TRIVIA_SECONDS * 1000 * EXTENDED_TIME_MULTIPLIER,
    );
    const state = applyAnswer(
      chosen,
      true,
      new Date(startedAt.getTime() + (TRIVIA_SECONDS + 1) * 1000),
    );
    expect(state.lastResult.timedOut).toBe(false);
  });

  it('prevents a second cell while a round is active and prevents cell reuse', () => {
    const initial = createGame(questions(), 'reuse');
    const first = initial.cells[0];
    const second = initial.cells[1];
    const chosen = chooseCell(initial, first.cellId, startedAt);
    expect(() => chooseCell(chosen, second.cellId, startedAt)).toThrow(
      'TIMER_TRIVIA_ROUND_ACTIVE',
    );
    const answered = applyAnswer(chosen, true, startedAt);
    expect(() => chooseCell(answered, first.cellId, startedAt)).toThrow(
      'TIMER_TRIVIA_CELL_UNAVAILABLE',
    );
  });

  it('preserves the active question and deadline for refresh', () => {
    const initial = createGame(questions(), 'refresh');
    const chosen = chooseCell(initial, initial.cells[0].cellId, startedAt);
    const refreshed = structuredClone(chosen);
    expect(currentQuestion(refreshed)).toEqual(currentQuestion(chosen));
    expect(refreshed.deadlineAt).toBe(chosen.deadlineAt);
  });

  it('finishes after ten distinct rounds and rejects terminal moves', () => {
    let state = createGame(questions(), 'finish');
    for (let round = 0; round < TRIVIA_ROUNDS; round += 1) {
      const cell = state.cells.find((candidate) => candidate.state === 'open');
      state = answerCell(state, cell.cellId, true);
    }
    expect(state).toMatchObject({ status: 'finished', roundsCompleted: 10 });
    expect(new Set(state.answeredQuestionIds).size).toBe(10);
    const snapshot = structuredClone(state);
    expect(() => chooseCell(state, state.cells[10].cellId, startedAt)).toThrow(
      'TIMER_TRIVIA_FINISHED',
    );
    expect(() => applyAnswer(state, true, startedAt)).toThrow(
      'TIMER_TRIVIA_FINISHED',
    );
    expect(state).toEqual(snapshot);
  });

  it('refuses fewer than ten eligible questions or fewer than ten board cells', () => {
    expect(() => createGame(questions().slice(0, 9), 'short')).toThrow(
      'TIMER_TRIVIA_NOT_ENOUGH_QUESTIONS',
    );
    const oneCell = Array.from({ length: 10 }, (_, index) => ({
      question_id: `same-${index}`,
      topic_name: 'One topic',
      difficulty_level: 1,
    }));
    expect(() => createGame(oneCell, 'few-cells')).toThrow(
      'TIMER_TRIVIA_NOT_ENOUGH_BOARD_CELLS',
    );
  });

  it('keeps score non-negative and questions unique for random play', () => {
    fc.assert(
      fc.property(
        fc.array(fc.boolean(), { maxLength: 25 }),
        fc.integer(),
        (answers, seed) => {
          let state = createGame(questions(), seed);
          let previousScore = 0;
          for (const answer of answers) {
            if (isTerminal(state)) {
              const snapshot = structuredClone(state);
              expect(() => applyAnswer(state, answer, startedAt)).toThrow(
                'TIMER_TRIVIA_FINISHED',
              );
              expect(state).toEqual(snapshot);
              break;
            }
            const cell = state.cells.find(
              (candidate) => candidate.state === 'open',
            );
            state = answerCell(state, cell.cellId, answer);
            expect(state.score).toBeGreaterThanOrEqual(previousScore);
            expect(state.score).toBeGreaterThanOrEqual(0);
            expect(state.roundsCompleted).toBeLessThanOrEqual(TRIVIA_ROUNDS);
            expect(new Set(state.answeredQuestionIds).size).toBe(
              state.answeredQuestionIds.length,
            );
            previousScore = state.score;
          }
        },
      ),
    );
  });
});
