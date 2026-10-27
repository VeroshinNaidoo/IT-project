import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { tierOf } from '../src/games/difficulty.js';
import {
  registerGameStateSchema,
  validateGameState,
} from '../src/games/play-state.js';

describe('shared game platform foundation', () => {
  it.each([
    [1, 'easy'],
    [2, 'easy'],
    [3, 'medium'],
    [4, 'hard'],
    [5, 'hard'],
  ])('maps difficulty level %s to %s', (level, tier) => {
    expect(tierOf(level)).toBe(tier);
  });

  it('rejects difficulty levels outside 1..5', () => {
    for (const level of [0, 6, 2.5, '3', null])
      expect(() => tierOf(level)).toThrow('INVALID_DIFFICULTY_LEVEL');
  });

  it('validates versioned state through a game-owned Zod schema', () => {
    registerGameStateSchema(
      'foundation_test',
      z.object({ matches: z.number().int().nonnegative() }),
    );
    expect(
      validateGameState('foundation_test', { version: 1, matches: 2 }),
    ).toEqual({ version: 1, matches: 2 });
    expect(() =>
      validateGameState('foundation_test', { matches: 2 }),
    ).toThrow();
  });
});
