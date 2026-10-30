// @vitest-environment jsdom
import React from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
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
const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
};

describe('Timer Trivia frontend', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    window.localStorage.clear();
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
    await flush();
    fireEvent.click(
      screen.getAllByRole('button', { name: /Databases, 30 points/ })[0],
    );
    await flush();
    expect(screen.getByText(question.questionText)).toBeTruthy();
    fireEvent.click(screen.getByLabelText('A table'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit answer' }));
    expect(await screen.findByText('Correct')).toBeTruthy();
    expect(screen.getByText('Points earned: 30')).toBeTruthy();
  });

  it('announces the 10-second and 5-second thresholds exactly once', async () => {
    vi.useFakeTimers();
    const now = new Date('2026-10-30T10:00:00.000Z');
    vi.setSystemTime(now);
    const chosen = {
      ...board,
      activeCellId: 'cell-2',
      deadlineAt: new Date(now.getTime() + 30000).toISOString(),
    };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(response({ data: startData }))
        .mockResolvedValueOnce(response({ data: { play: chosen, question } })),
    );
    render(<TimerTriviaGame quizId="timer-quiz" onBack={() => {}} />);
    await flush();
    fireEvent.click(
      screen.getAllByRole('button', { name: /Databases, 30 points/ })[0],
    );
    await flush();
    expect(screen.getByText(question.questionText)).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(20000);
    });
    expect(screen.getByText('10 seconds remaining')).toBeTruthy();
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByText('5 seconds remaining')).toBeTruthy();
    expect(screen.getAllByText('5 seconds remaining')).toHaveLength(1);
  });

  it('does not re-announce a passed threshold after refresh', async () => {
    vi.useFakeTimers();
    const now = new Date('2026-10-30T10:00:00.000Z');
    vi.setSystemTime(now);
    const chosen = {
      ...board,
      activeCellId: 'cell-2',
      deadlineAt: new Date(now.getTime() + 30000).toISOString(),
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response({ data: { play: chosen, question } }));
    vi.stubGlobal('fetch', fetchMock);
    const view = render(
      <TimerTriviaGame quizId="timer-quiz" onBack={() => {}} />,
    );
    await flush();
    expect(screen.getByText(question.questionText)).toBeTruthy();
    await act(async () => {
      vi.advanceTimersByTime(20000);
    });
    expect(screen.getByText('10 seconds remaining')).toBeTruthy();
    view.unmount();
    vi.setSystemTime(new Date(now.getTime() + 20500));
    render(<TimerTriviaGame quizId="timer-quiz" onBack={() => {}} />);
    await flush();
    expect(screen.getByText(question.questionText)).toBeTruthy();
    expect(screen.queryByText('10 seconds remaining')).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(4500);
    });
    expect(screen.getByText('5 seconds remaining')).toBeTruthy();
  });

  it('uses the doubled deadline for extended-time announcements', async () => {
    vi.useFakeTimers();
    const now = new Date('2026-10-30T10:00:00.000Z');
    vi.setSystemTime(now);
    const chosen = {
      ...board,
      extendedTime: true,
      activeCellId: 'cell-2',
      deadlineAt: new Date(now.getTime() + 60000).toISOString(),
    };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(response({ data: startData }))
        .mockResolvedValueOnce(response({ data: { play: chosen, question } })),
    );
    render(<TimerTriviaGame quizId="timer-quiz" onBack={() => {}} />);
    await flush();
    fireEvent.click(
      screen.getAllByRole('button', { name: /Databases, 30 points/ })[0],
    );
    await flush();
    expect(screen.getByText(question.questionText)).toBeTruthy();
    await act(async () => {
      vi.advanceTimersByTime(50000);
    });
    expect(screen.getByText('10 seconds remaining')).toBeTruthy();
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByText('5 seconds remaining')).toBeTruthy();
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
