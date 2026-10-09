// @ts-nocheck - policy accepts runtime API records.
/**
 * Single policy boundary for game visibility.
 * Games are practice-only and never contribute to scored leaderboard results.
 */
export function canAccessGame(
  user,
  quiz,
  { scoredAttemptCompleted = false } = {},
) {
  if (!user || !quiz) return false;
  if (user.role === 'lecturer') return true;
  if (user.role !== 'student') return false;
  return !quiz.is_competitive || scoredAttemptCompleted;
}
