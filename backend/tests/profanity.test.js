import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  containsProfanity,
  noProfanity,
  profanityLists,
  profanityMessage,
} from '../src/profanity/index.js';
import {
  clearProfanityViolations,
  isProfanityCooldownActive,
  recordProfanityViolation,
} from '../src/profanity/rate-limit.js';

describe('shared profanity filter', () => {
  afterEach(() => clearProfanityViolations());

  it.each([
    ['obvious profanity', 'fuck'],
    ['case variant', 'FUCK'],
    ['leet variant', 'f.u.c.k'],
    ['letter-spaced variant', 'f u c k'],
    ['repeated-letter variant', 'fuuuuuck'],
    ['custom South African term', 'fok'],
  ])('rejects %s', (_name, value) =>
    expect(containsProfanity(value)).toBe(true),
  );

  it.each([
    'fullName',
    'moduleName',
    'groupName',
    'resourceTitle',
    'quizTitle',
    'topicName',
  ])('can be applied to %s', () => {
    const schema = z.object({
      value: z.string().refine(noProfanity(), { message: profanityMessage }),
    });
    expect(schema.safeParse({ value: 'fuck' }).success).toBe(false);
  });

  it.each([
    'Scunthorpe',
    'Cockburn',
    'Dickson',
    'Hancock',
    'Essex',
    'assessment',
    'class',
    'analysis',
    'Cassidy',
    'database normalization',
  ])('accepts false-positive guard %s', (value) =>
    expect(containsProfanity(value)).toBe(false),
  );

  it('loads editable custom and allow lists from JSON', () => {
    expect(profanityLists.customTerms).toContain('fok');
    expect(profanityLists.allowedTerms).toContain('scunthorpe');
  });

  it('returns only a generic error without the matched word', () => {
    const result = z
      .string()
      .refine(noProfanity(), { message: profanityMessage })
      .safeParse('fuck');
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues[0].message).toBe(profanityMessage);
    expect(JSON.stringify(result)).not.toContain('fuck');
  });

  it('tracks repeated violations and applies a temporary cooldown without banning', () => {
    for (let i = 0; i < 10; i += 1)
      recordProfanityViolation('user-1', 1000 + i);
    expect(isProfanityCooldownActive('user-1', 1009)).toBe(true);
    expect(isProfanityCooldownActive('user-1', 10 * 60 * 1000 + 2000)).toBe(
      false,
    );
  });
});
