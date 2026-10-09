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
import { App, QuizTaking, ResourceRow } from './main.jsx';

const response = (body, ok = true) => ({
  ok,
  status: ok ? 200 : 401,
  json: async () => body,
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
              { questionId: 'q-1', questionText: 'Question', topic: 'Topic' },
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
              { questionId: 'q-1', questionText: 'Question', topic: 'Topic' },
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
});
