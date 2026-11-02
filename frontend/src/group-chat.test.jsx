// @vitest-environment jsdom
import React from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GroupChat } from './group-chat.jsx';

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, options = {}) => {
      if (String(url).endsWith('/reports'))
        return {
          ok: true,
          json: async () => ({
            data: [{ report_id: 'r1', reason: 'spam', body: 'Reported text' }],
          }),
        };
      if (options.method === 'POST')
        return {
          ok: true,
          json: async () => ({
            message_id: 'new',
            author_name: 'Student',
            body: 'Posted',
            kind: 'message',
          }),
        };
      return {
        ok: true,
        headers: { get: () => 'etag-1' },
        json: async () => ({
          data: [
            {
              message_id: 'm1',
              author_name: 'Leader',
              body: 'Use https://example.com and <b>text</b>',
              kind: 'announcement',
              pinned: true,
            },
          ],
          nextAfter: 'm1',
        }),
      };
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('renders escaped message text and safe https links', async () => {
  const { container } = render(<GroupChat groupId="group" />);
  expect(await screen.findByText(/Use/)).toBeTruthy();
  expect(container.querySelector('script')).toBeNull();
  expect(container.querySelector('.chat-message p').textContent).toContain(
    '<b>text</b>',
  );
  const link = screen.getByRole('link', { name: 'https://example.com' });
  expect(link.getAttribute('target')).toBe('_blank');
  expect(link.getAttribute('rel')).toBe('noopener noreferrer');
});

it('posts a member message and shows the status', async () => {
  render(<GroupChat groupId="group" />);
  await screen.findByText(/Leader/);
  fireEvent.change(screen.getByLabelText('Write a message'), {
    target: { value: 'Hello group' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Post message' }));
  await waitFor(() =>
    expect(screen.getByRole('status').textContent).toContain('Message posted.'),
  );
});

it('renders a read-only lecturer view without a composer', async () => {
  render(<GroupChat groupId="group" readOnly />);
  await screen.findByText(/Leader/);
  expect(screen.queryByLabelText('Write a message')).toBeNull();
  expect(screen.getByText(/only members can post/)).toBeTruthy();
});

it('lets a leader choose announcements and see the moderation list', async () => {
  render(<GroupChat groupId="group" canModerate />);
  await screen.findByText(/Leader/);
  expect(
    screen.getByRole('complementary', { name: 'Open message reports' })
      .textContent,
  ).toContain('spam');
  fireEvent.click(
    screen.getByRole('checkbox', { name: 'Post as announcement' }),
  );
  fireEvent.change(screen.getByLabelText('Write a message'), {
    target: { value: 'Next study focus' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Post announcement' }));
  await waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/groups/group/messages',
      expect.objectContaining({
        body: JSON.stringify({
          body: 'Next study focus',
          kind: 'announcement',
        }),
      }),
    ),
  );
});
