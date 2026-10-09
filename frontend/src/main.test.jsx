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
import { App, QuizTaking } from './main.jsx';

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
});
