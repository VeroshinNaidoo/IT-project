// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TimerTriviaGame } from './main.jsx';

const response = (body, ok = true) => ({
  ok,
  status: ok ? 200 : 409,
  json: async () => body,
});
const board = {
  playId: 'timer-play',
  quizId: 'timer-quiz',
  status: 'in_progress',
  score: 0,
  roundsCompleted: 0,
  roundsRemaining: 10,
  topics: ['Databases'],
  activeCellId: null,
  deadlineAt: null,
  extendedTime: false,
  board: Array.from({ length: 10 }, (_, index) => ({
    cellId: `cell-${index}`,
    topic: 'Databases',
    level: (index % 5) + 1,
    points: ((index % 5) + 1) * 10,
    state: 'open',
    disabled: false,
  })),
};
const question = {
  questionId: 'timer-question',
  questionText: 'Which structure stores rows?',
  topic: 'Databases',
  difficultyLevel: 3,
  options: [
    { optionId: 'correct', optionText: 'A table' },
    { optionId: 'wrong', optionText: 'A canvas' },
  ],
};
const startData = { play: board, question: null, resumed: false };

describe('Timer Trivia frontend', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders a board with disabled-safe cells and no answer before choosing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response({ data: startData })),
    );
    render(<TimerTriviaGame quizId="timer-quiz" onBack={() => {}} />);
    expect(await screen.findByText('TIMER TRIVIA')).toBeTruthy();
    expect(
      screen.getAllByRole('button', { name: /Databases, 50 points/ })[0],
    ).toBeTruthy();
    expect(screen.queryByText(question.questionText)).toBeNull();
  });

  it('chooses a cell, shows the question, submits and announces feedback', async () => {
    const chosen = {
      ...board,
      activeCellId: 'cell-2',
      deadlineAt: new Date(Date.now() + 30000).toISOString(),
    };
    const answered = {
      ...board,
      roundsCompleted: 1,
      score: 30,
      board: board.board.map((cell, index) =>
        index === 2 ? { ...cell, disabled: true, state: 'answered' } : cell,
      ),
    };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(response({ data: startData }))
        .mockResolvedValueOnce(response({ data: { play: chosen, question } }))
        .mockResolvedValueOnce(
          response({
            data: {
              play: answered,
              question: null,
              isCorrect: true,
              timedOut: false,
              pointsEarned: 30,
              correctOption: question.options[0],
              explanation: 'Tables store rows.',
            },
          }),
        ),
    );
    render(<TimerTriviaGame quizId="timer-quiz" onBack={() => {}} />);
    fireEvent.click(
      (
        await screen.findAllByRole('button', { name: /Databases, 30 points/ })
      )[0],
    );
    expect(await screen.findByText(question.questionText)).toBeTruthy();
    fireEvent.click(screen.getByLabelText('A table'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit answer' }));
    expect(await screen.findByText('Correct')).toBeTruthy();
    expect(screen.getByText('Points earned: 30')).toBeTruthy();
  });

  it.each([['finished', 'Board complete']])(
    'renders the %s terminal state',
    async (status, heading) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          response({
            data: {
              play: { ...board, status, roundsCompleted: 10, score: 300 },
              question: null,
            },
          }),
        ),
      );
      render(<TimerTriviaGame quizId="timer-quiz" onBack={() => {}} />);
      expect(await screen.findByText(heading)).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Play again' })).toBeTruthy();
    },
  );

  it('shows the friendly unavailable error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response(
          {
            error: {
              message: 'Timer Trivia needs at least 10 eligible questions.',
            },
          },
          false,
        ),
      ),
    );
    render(<TimerTriviaGame quizId="short-quiz" onBack={() => {}} />);
    expect(
      await screen.findByText(/Timer Trivia needs at least 10/),
    ).toBeTruthy();
  });
});
