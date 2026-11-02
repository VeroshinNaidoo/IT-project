import { describe, it, expect } from 'vitest';
import { calendarIcs, sessionSchema } from './sessions.js';
describe('study session validation and calendar', () => {
  it('escapes ICS delimiters and injected lines with a fixed clock', () => {
    const s = {
      session_id: 'test',
      title: 'Study, together; safely\nBEGIN:VEVENT',
      topic: 'Data',
      starts_at: '2030-01-02T10:00:00Z',
      ends_at: '2030-01-02T11:00:00Z',
      location: 'Room A',
      status: 'cancelled',
      cancel_reason: 'Room closed',
    };
    const out = calendarIcs([s], new Date('2030-01-01T00:00:00Z'));
    expect(out).toContain('DTSTAMP:20300101T000000Z');
    expect(out).toContain('Study\\, together\\; safely\\nBEGIN:VEVENT');
    expect(out.match(/\r\nBEGIN:VEVENT/g)).toHaveLength(1);
    expect(out).toContain('STATUS:CANCELLED');
  });
  it('rejects profanity in every new visible text field and unknown input', () => {
    const value = {
      title: 'Study',
      topic: 'Data',
      startsAt: '2030-01-02T10:00:00Z',
      endsAt: '2030-01-02T11:00:00Z',
      mode: 'in_person',
      location: 'Room A',
    };
    expect(sessionSchema.safeParse(value).success).toBe(true);
    for (const field of [
      'title',
      'topic',
      'description',
      'preparationNotes',
      'location',
    ])
      expect(
        sessionSchema.safeParse({ ...value, [field]: 'fuck' }).success,
      ).toBe(false);
    expect(
      sessionSchema.safeParse({ ...value, createdBy: 'other' }).success,
    ).toBe(false);
  });
});
