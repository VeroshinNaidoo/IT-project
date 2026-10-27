// @ts-nocheck - shared runtime mapping for persisted difficulty levels.
export const difficultyLevelSchemaValues = Object.freeze([1, 2, 3, 4, 5]);

export function tierOf(level) {
  if (!Number.isInteger(level) || level < 1 || level > 5)
    throw new Error('INVALID_DIFFICULTY_LEVEL');
  if (level <= 2) return 'easy';
  if (level === 3) return 'medium';
  return 'hard';
}
