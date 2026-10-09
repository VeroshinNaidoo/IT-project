const violations = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_VIOLATIONS = 10;
const COOLDOWN_MS = 10 * 60 * 1000;

/** @param {string} userId @param {number} [now] */
export function recordProfanityViolation(userId, now = Date.now()) {
  /** @type {{timestamps: number[], cooldownUntil: number}} */
  const current = violations.get(userId) ?? {
    timestamps: [],
    cooldownUntil: 0,
  };
  current.timestamps = current.timestamps.filter(
    /** @param {number} timestamp */
    (timestamp) => now - timestamp < WINDOW_MS,
  );
  current.timestamps.push(now);
  if (current.timestamps.length >= MAX_VIOLATIONS)
    current.cooldownUntil = now + COOLDOWN_MS;
  violations.set(userId, current);
  return {
    count: current.timestamps.length,
    cooldownUntil: current.cooldownUntil,
  };
}

/** @param {string} userId @param {number} [now] */
export function isProfanityCooldownActive(userId, now = Date.now()) {
  const current = violations.get(userId);
  return Boolean(current && current.cooldownUntil > now);
}

export function clearProfanityViolations() {
  violations.clear();
}
