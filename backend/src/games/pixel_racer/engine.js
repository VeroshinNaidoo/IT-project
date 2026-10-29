// @ts-nocheck - pure engine state is covered by transition and property tests.
import {
  BOT_ACCURACY,
  DISTANCE_PER_SPEED,
  MAX_SPEED,
  MIN_SPEED,
  NITRO_MULTIPLIER,
  NITRO_STREAK,
  POINTS_PER_CORRECT,
  RACE_MIN_QUESTIONS,
  RACE_SLOTS,
  START_SPEED,
} from './config.js';

const questionIdOf = (question) =>
  question.question_id ?? question.questionId ?? question.id;

const seededRng = (seed) => {
  const text = String(seed ?? 'pixel-racer');
  let value = 2166136261;
  for (const character of text) {
    value ^= character.codePointAt(0);
    value = Math.imul(value, 16777619);
  }
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
};

const shuffle = (questions, rng) => {
  const result = [...questions];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(rng() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
};

const eligibleQuestions = (questions) => {
  if (!Array.isArray(questions)) return [];
  const seen = new Set();
  return questions.filter((question) => {
    const id = questionIdOf(question);
    if (id === undefined || id === null || seen.has(String(id))) return false;
    seen.add(String(id));
    return true;
  });
};

export const isTerminal = (state) => state.status === 'finished';

/**
 * @param {Array<Record<string, unknown>>} questions
 * @param {string | number | (() => number)} [seed]
 */
export function createRace(questions, seed = 'pixel-racer') {
  const eligible = eligibleQuestions(questions);
  if (eligible.length < RACE_MIN_QUESTIONS)
    throw new Error('PIXEL_RACER_NOT_ENOUGH_QUESTIONS');
  const rng = typeof seed === 'function' ? seed : seededRng(seed);
  return {
    status: 'in_progress',
    questions: shuffle(eligible, rng).slice(0, RACE_SLOTS),
    slotsUsed: 0,
    answersUsed: 0,
    speed: START_SPEED,
    distance: 0,
    streak: 0,
    points: 0,
    nitroActive: false,
    answeredQuestionIds: [],
  };
}

export function currentQuestion(state) {
  if (isTerminal(state)) return null;
  return state.questions[state.slotsUsed] ?? null;
}

export function applyAnswer(state, isCorrect) {
  if (isTerminal(state)) throw new Error('PIXEL_RACER_FINISHED');
  const question = currentQuestion(state);
  if (!question) throw new Error('PIXEL_RACER_EXHAUSTED');

  const usedNitro = state.nitroActive && Boolean(isCorrect);
  const speed = isCorrect
    ? Math.min(MAX_SPEED, state.speed + 1)
    : Math.max(MIN_SPEED, state.speed - 1);
  const streak = isCorrect ? state.streak + 1 : 0;
  const multiplier = usedNitro ? NITRO_MULTIPLIER : 1;
  const slotsDelta = usedNitro ? NITRO_MULTIPLIER : 1;
  const slotsUsed = Math.min(RACE_SLOTS, state.slotsUsed + slotsDelta);
  const distanceDelta = DISTANCE_PER_SPEED * speed * multiplier;
  const pointsDelta = isCorrect ? POINTS_PER_CORRECT * multiplier : 0;
  const answeredQuestionIds = [
    ...state.answeredQuestionIds,
    String(questionIdOf(question)),
  ];

  return {
    ...state,
    status: slotsUsed >= RACE_SLOTS ? 'finished' : 'in_progress',
    slotsUsed,
    answersUsed: state.answersUsed + 1,
    speed,
    distance: state.distance + distanceDelta,
    streak,
    points: state.points + pointsDelta,
    nitroActive: Boolean(isCorrect) && (usedNitro || streak >= NITRO_STREAK),
    answeredQuestionIds,
  };
}

/**
 * @param {Array<Record<string, unknown>>} questions
 * @param {string | number | (() => number)} [seed]
 */
export function simulateBot(questions, seed = 'pixel-racer-bot') {
  const rng = typeof seed === 'function' ? seed : seededRng(seed);
  let state = createRace(questions, rng);
  while (!isTerminal(state)) state = applyAnswer(state, rng() < BOT_ACCURACY);
  return { ...state, name: 'Bot' };
}

export function winnerOf(player, bot) {
  if (!isTerminal(player) || !isTerminal(bot))
    throw new Error('PIXEL_RACER_NOT_FINISHED');
  if (player.distance !== bot.distance)
    return player.distance > bot.distance ? 'player' : 'bot';
  if (player.points !== bot.points)
    return player.points > bot.points ? 'player' : 'bot';
  return 'shared';
}
