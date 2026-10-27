// @vitest-environment jsdom
import React from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  App,
  InfectedGame,
  IslandEscapeGame,
  QuizTaking,
  ResourceRow,
} from './main.jsx';

const response = (body, ok = true) => ({
  ok,
  status: ok ? 200 : 401,
  json: async () => body,
});

const islandPlay = (overrides = {}) => ({
  playId: 'play-1',
  phase: 1,
  phaseName: 'Gather materials',
  phaseQuestionNumber: 0,
  wrongInPhase: 0,
  streak: 0,
  doubleActive: false,
  setbacks: 0,
  retriesRemaining: 3,
  score: 0,
  materials: [],
  boatParts: [],
  sailProgress: 0,
  status: 'in_progress',
  ...overrides,
});

const islandQuestion = {
  questionId: 'question-1',
  questionText: 'Which material makes a strong mast?',
  difficultyLevel: 1,
  difficulty: 'easy',
  topic: 'Materials',
  options: [
    { optionId: 'option-1', optionText: 'Wood' },
    { optionId: 'option-2', optionText: 'Paper' },
  ],
};

describe('Island Escape solo game', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => cleanup());

  it('renders a pending question without revealing correctness and applies feedback', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          response({ play: islandPlay(), question: islandQuestion }),
        )
        .mockResolvedValueOnce(
          response({
            isCorrect: true,
            correctOption: { optionId: 'option-1', optionText: 'Wood' },
            explanation: 'Wood is rigid enough to support the sail.',
            pointsEarned: 10,
            event: 'answer',
            play: islandPlay({
              phaseQuestionNumber: 1,
              streak: 1,
              score: 10,
              materials: ['Wood'],
            }),
            question: { ...islandQuestion, questionId: 'question-2' },
          }),
        ),
    );
    render(<IslandEscapeGame quizId="quiz-1" onBack={() => {}} />);
    expect(await screen.findByText(islandQuestion.questionText)).toBeTruthy();
    expect(screen.queryByText(/Correct answer:/)).toBeNull();
    fireEvent.click(screen.getByLabelText('Wood'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit answer' }));
    expect(await screen.findByText('Correct')).toBeTruthy();
    expect(screen.getByText(/Points earned: 10/)).toBeTruthy();
    expect(screen.getByText(/Score: 10/)).toBeTruthy();
  });

  it('shows setback details and continues from the restarted phase', async () => {
    const restarted = islandPlay({ setbacks: 1, retriesRemaining: 2 });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          response({
            play: islandPlay({ wrongInPhase: 4 }),
            question: islandQuestion,
          }),
        )
        .mockResolvedValueOnce(
          response({
            isCorrect: false,
            correctOption: { optionId: 'option-1', optionText: 'Wood' },
            explanation: 'Wood is the stronger choice.',
            pointsEarned: 0,
            event: 'tools_lost',
            play: restarted,
            question: { ...islandQuestion, questionId: 'restart-question' },
          }),
        ),
    );
    render(<IslandEscapeGame quizId="quiz-2" onBack={() => {}} />);
    fireEvent.click(await screen.findByLabelText('Paper'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit answer' }));
    expect(await screen.findByText('Your tools were lost')).toBeTruthy();
    expect(screen.getByText('2 retries remain.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(islandQuestion.questionText)).toBeTruthy();
    expect(screen.getByText(/Wrong answers 0 of 5/)).toBeTruthy();
  });

  it.each([
    ['won', 'You reached the mainland'],
    ['lost', 'Stranded'],
    ['exhausted', 'No more questions are available'],
  ])('renders the %s terminal state', async (status, heading) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          play: islandPlay({ status, score: 570 }),
          question: null,
          personalBest: 570,
        }),
      ),
    );
    render(<IslandEscapeGame quizId={`quiz-${status}`} onBack={() => {}} />);
    expect(await screen.findByText(heading)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play again' })).toBeTruthy();
    cleanup();
  });

  it('resumes the server-owned question after reload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          resumed: true,
          play: islandPlay({ phase: 2, phaseQuestionNumber: 3, score: 120 }),
          question: islandQuestion,
        }),
      ),
    );
    render(<IslandEscapeGame quizId="quiz-resume" onBack={() => {}} />);
    expect(await screen.findByText(islandQuestion.questionText)).toBeTruthy();
    expect(screen.getByText(/Phase 2 of 3 · Question 4 of 10/)).toBeTruthy();
    expect(screen.queryByText(/Correct answer:/)).toBeNull();
  });

  it('shows friendly unavailable and empty states', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          response(
            { error: { message: 'Needs a quiz with at least 30 questions.' } },
            false,
          ),
        ),
    );
    const view = render(
      <IslandEscapeGame quizId="quiz-short" onBack={() => {}} />,
    );
    expect(
      await screen.findByText('Needs a quiz with at least 30 questions.'),
    ).toBeTruthy();
    view.unmount();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(response({ play: islandPlay(), question: null })),
    );
    render(<IslandEscapeGame quizId="quiz-empty" onBack={() => {}} />);
    expect(
      await screen.findByText('No Island Escape question is ready.'),
    ).toBeTruthy();
  });
});

describe('frontend authentication and role routing', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => cleanup());

  it('shows the authentication form and reports inline errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          response(
            { error: { message: 'Email or password is incorrect.' } },
            false,
          ),
        ),
    );
    render(<App />);
    await waitFor(() => expect(screen.getByText('Welcome back')).toBeTruthy());
    fireEvent.submit(
      screen.getByRole('button', { name: 'Log in' }).closest('form'),
    );
    await waitFor(() =>
      expect(screen.getByText('Email or password is incorrect.')).toBeTruthy(),
    );
  });

  it('shows lecturer-only navigation after a real login response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({ error: { message: 'Not signed in.' } }, false),
      )
      .mockResolvedValueOnce(
        response({ user: { role: 'lecturer', full_name: 'Lecturer' } }),
      )
      .mockResolvedValueOnce(response({ data: [] }));
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    await waitFor(() => screen.getByText('Welcome back'));
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'lecturer@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'StrongPassword1!' },
    });
    fireEvent.submit(
      screen.getByRole('button', { name: 'Log in' }).closest('form'),
    );
    await waitFor(() => expect(screen.getByText('Analytics')).toBeTruthy());
    const loginCall = fetchMock.mock.calls.find(([url]) =>
      url.endsWith('/auth/login'),
    );
    expect(JSON.parse(loginCall[1].body)).toEqual({
      email: 'lecturer@example.com',
      password: 'StrongPassword1!',
    });
    expect(screen.queryByText('Study groups')).toBeNull();
  });

  it('renders the competitive quiz warning and keeps unavailable submission disabled', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          attempt: { attempt_id: 'attempt-1' },
          quiz: { title: 'Quiz', is_competitive: true },
          questions: [],
        }),
      ),
    );
    render(<QuizTaking quizId="quiz-1" />);
    await waitFor(() => screen.getByText('One scored attempt only.'));
    expect(
      screen.getByRole('button', { name: 'Submit attempt' }).disabled,
    ).toBe(false);
  });

  it('shows queued, running and succeeded AI generation states with an editable draft', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({ job: { job_id: 'job-1', status: 'queued' } }),
      )
      .mockResolvedValueOnce(
        response({ job: { job_id: 'job-1', status: 'running' } }),
      )
      .mockResolvedValueOnce(
        response({
          job: { job_id: 'job-1', status: 'succeeded', quiz_id: 'quiz-1' },
        }),
      )
      .mockResolvedValueOnce(
        response({
          quiz: {
            quiz_id: 'quiz-1',
            title: 'Draft quiz',
            is_competitive: false,
            questions: [
              {
                questionId: 'q-1',
                questionText: 'Question',
                topic: 'Topic',
                difficultyLevel: 3,
                explanation: 'This is the explanation.',
              },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(
        response({
          quiz: {
            quiz_id: 'quiz-1',
            title: 'Published draft',
            is_competitive: true,
            questions: [
              {
                questionId: 'q-1',
                questionText: 'Question',
                topic: 'Topic',
                difficultyLevel: 3,
                explanation: 'This is the explanation.',
              },
            ],
          },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    render(
      <ResourceRow
        lecturer
        resource={{
          resource_id: 'resource-1',
          title: 'Notes',
          resource_type: 'txt',
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Generate quiz' }));
    await waitFor(() => expect(screen.getByText(/running/i)).toBeTruthy(), {
      timeout: 1000,
    });
    await waitFor(
      () => expect(screen.getByText('Generated draft')).toBeTruthy(),
      { timeout: 1500 },
    );
    expect(screen.getByDisplayValue('Draft quiz')).toBeTruthy();
    expect(screen.getByText('Topic')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Quiz title'), {
      target: { value: 'Published draft' },
    });
    fireEvent.change(screen.getByLabelText('Mode'), {
      target: { value: 'competitive' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Publish quiz' }));
    await waitFor(() => expect(fetchMock.mock.calls.length).toBe(5));
  });

  it('shows a friendly failed state and exposes retry', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({ job: { job_id: 'job-2', status: 'queued' } }),
      )
      .mockResolvedValueOnce(
        response({
          job: {
            job_id: 'job-2',
            status: 'failed',
            error_code: 'GENERATION_FAILED',
          },
        }),
      )
      .mockResolvedValueOnce(
        response({ job: { job_id: 'job-3', status: 'queued' } }),
      );
    vi.stubGlobal('fetch', fetchMock);
    render(
      <ResourceRow
        lecturer
        resource={{
          resource_id: 'resource-2',
          title: 'Notes',
          resource_type: 'txt',
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Generate quiz' }));
    await waitFor(
      () => expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy(),
      { timeout: 1000 },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3),
    );
  });

  it('renders Infected cards without answers, then chooses and answers correctly', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          session: {
            sessionId: 'session-1',
            cure: 0,
            hearts: 3,
            score: 0,
            status: 'in_progress',
          },
          cards: [
            {
              cardId: 'card-1',
              difficulty: 'hard',
              topic: 'Normalization',
              reward: 30,
              penalty: 15,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        response({
          question: {
            questionId: 'card-1',
            questionText: 'Which form removes transitive dependencies?',
            difficulty: 'hard',
            topic: 'Normalization',
            options: [
              { optionId: 'option-1', optionText: 'Third normal form' },
              { optionId: 'option-2', optionText: 'First normal form' },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(
        response({
          isCorrect: true,
          correctOption: {
            optionId: 'option-1',
            optionText: 'Third normal form',
          },
          explanation: 'Third normal form removes transitive dependencies.',
          session: {
            sessionId: 'session-1',
            cure: 30,
            hearts: 3,
            score: 30,
            status: 'in_progress',
          },
          cards: [
            {
              cardId: 'card-2',
              difficulty: 'easy',
              topic: 'Keys',
              reward: 10,
              penalty: 5,
            },
          ],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    render(<InfectedGame quizId="quiz-1" onBack={() => {}} />);
    const card = await screen.findByRole('button', {
      name: /hard card about normalization/i,
    });
    expect(screen.queryByText('Third normal form')).toBeNull();
    fireEvent.click(card);
    await screen.findByText('Which form removes transitive dependencies?');
    fireEvent.click(screen.getByLabelText('Third normal form'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit answer' }));
    await screen.findByText('Correct');
    expect(screen.getByText(/Cure 30% · Infection 70%/)).toBeTruthy();
    expect(screen.getByText(/3 of 3 hearts/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(
      screen.getByRole('button', { name: /easy card about keys/i }),
    ).toBeTruthy();
  });

  it('announces an incorrect answer and updates cure and hearts', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          response({
            session: {
              sessionId: 'session-2',
              cure: 40,
              hearts: 3,
              score: 20,
              status: 'in_progress',
            },
            cards: [
              {
                cardId: 'card-2',
                difficulty: 'hard',
                topic: 'Queries',
                reward: 30,
                penalty: 15,
              },
            ],
          }),
        )
        .mockResolvedValueOnce(
          response({
            question: {
              questionId: 'card-2',
              questionText: 'Choose the query result.',
              difficulty: 'hard',
              options: [
                { optionId: 'wrong', optionText: 'Wrong result' },
                { optionId: 'right', optionText: 'Correct result' },
              ],
            },
          }),
        )
        .mockResolvedValueOnce(
          response({
            isCorrect: false,
            correctOption: {
              optionId: 'right',
              optionText: 'Correct result',
            },
            explanation: 'The correct result follows the WHERE clause.',
            session: {
              sessionId: 'session-2',
              cure: 25,
              hearts: 2,
              score: 20,
              status: 'in_progress',
            },
            cards: [],
          }),
        ),
    );
    render(<InfectedGame quizId="quiz-2" onBack={() => {}} />);
    fireEvent.click(
      await screen.findByRole('button', { name: /hard card about queries/i }),
    );
    fireEvent.click(await screen.findByLabelText('Wrong result'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit answer' }));
    await screen.findByText('Incorrect');
    expect(screen.getByText(/Cure 25% · Infection 75%/)).toBeTruthy();
    expect(screen.getByText(/2 of 3 hearts/)).toBeTruthy();
    expect(screen.getByText(/Correct answer:/)).toBeTruthy();
  });

  it.each([
    ['won', 'Cure complete — you win!'],
    ['lost', 'No hearts left'],
    ['exhausted', 'Questions exhausted'],
  ])('renders the %s terminal screen', async (status, heading) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          session: {
            sessionId: `session-${status}`,
            cure: status === 'won' ? 100 : 40,
            hearts: status === 'lost' ? 0 : 2,
            score: 60,
            status,
          },
          cards: [],
        }),
      ),
    );
    render(<InfectedGame quizId={`quiz-${status}`} onBack={() => {}} />);
    expect(await screen.findByText(heading)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play again' })).toBeTruthy();
    cleanup();
  });

  it('restores a pending question when a session resumes after reload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          resumed: true,
          session: {
            sessionId: 'session-resume',
            cure: 20,
            hearts: 2,
            score: 20,
            status: 'in_progress',
          },
          cards: [],
          question: {
            questionId: 'question-resume',
            questionText: 'Pending question after refresh?',
            difficulty: 'medium',
            options: [
              { optionId: 'a', optionText: 'Answer A' },
              { optionId: 'b', optionText: 'Answer B' },
            ],
          },
        }),
      ),
    );
    render(<InfectedGame quizId="quiz-resume" onBack={() => {}} />);
    expect(
      await screen.findByText('Pending question after refresh?'),
    ).toBeTruthy();
    expect(screen.getByLabelText('Answer A')).toBeTruthy();
  });

  it('shows friendly error and empty states', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response(
          {
            error: {
              message: 'Not enough questions for this game yet.',
            },
          },
          false,
        ),
      ),
    );
    const view = render(<InfectedGame quizId="quiz-error" onBack={() => {}} />);
    expect(
      await screen.findByText('Not enough questions for this game yet.'),
    ).toBeTruthy();
    view.unmount();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          session: {
            sessionId: 'session-empty',
            cure: 0,
            hearts: 3,
            score: 0,
            status: 'in_progress',
          },
          cards: [],
        }),
      ),
    );
    render(<InfectedGame quizId="quiz-empty" onBack={() => {}} />);
    expect(await screen.findByText('No cards are available.')).toBeTruthy();
  });
});
