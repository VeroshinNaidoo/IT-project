// @ts-nocheck - pure engine state is covered by transition and property tests.
import { tierOf } from '../difficulty.js';
import {
  BOSS_DAMAGE,
  BOSS_MAX_HP,
  BOSS_MIN_QUESTIONS,
  PLAYER_DAMAGE,
  PLAYER_MAX_HP,
} from './config.js';

const terminalStatuses = new Set(['won', 'lost', 'exhausted']);

const questionIdOf = (question) =>
  question.question_id ?? question.questionId ?? question.id;

const difficultyOf = (question) =>
  question.difficulty_level ?? question.difficultyLevel;

const seededRng = (seed) => {
  const text = String(seed ?? 'boss-battle');
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
    const questionId = questionIdOf(question);
    const difficultyLevel = difficultyOf(question);
    if (
      questionId === undefined ||
      questionId === null ||
      seen.has(String(questionId))
    )
      return false;
    try {
      tierOf(difficultyLevel);
    } catch {
      return false;
    }
    seen.add(String(questionId));
    return true;
  });
};

export const isTerminal = (state) => terminalStatuses.has(state.status);

/**
 * @param {Array<Record<string, unknown>>} questions
 * @param {string | number | (() => number)} [seed]
 */
export function createGame(questions, seed = 'boss-battle') {
  const eligible = eligibleQuestions(questions);
  if (eligible.length < BOSS_MIN_QUESTIONS)
    throw new Error('BOSS_NOT_ENOUGH_QUESTIONS');
  const rng = typeof seed === 'function' ? seed : seededRng(seed);
  return {
    bossHp: BOSS_MAX_HP,
    playerHp: PLAYER_MAX_HP,
    score: 0,
    status: 'in_progress',
    questions: shuffle(eligible, rng),
    questionIndex: 0,
    answeredQuestionIds: [],
  };
}

export function currentQuestion(state) {
  if (isTerminal(state)) return null;
  return state.questions[state.questionIndex] ?? null;
}

export function applyAnswer(state, isCorrect) {
  if (isTerminal(state)) throw new Error('BOSS_BATTLE_FINISHED');
  const question = currentQuestion(state);
  if (!question) throw new Error('BOSS_BATTLE_EXHAUSTED');
  const tier = tierOf(difficultyOf(question));
  const bossDamage = isCorrect ? Math.min(state.bossHp, BOSS_DAMAGE[tier]) : 0;
  const playerDamage = isCorrect
    ? 0
    : Math.min(state.playerHp, PLAYER_DAMAGE[tier]);
  const bossHp = Math.max(0, Math.min(BOSS_MAX_HP, state.bossHp - bossDamage));
  const playerHp = Math.max(
    0,
    Math.min(PLAYER_MAX_HP, state.playerHp - playerDamage),
  );
  const questionIndex = state.questionIndex + 1;
  const answeredQuestionIds = [
    ...state.answeredQuestionIds,
    String(questionIdOf(question)),
  ];
  const status =
    bossHp === 0
      ? 'won'
      : playerHp === 0
        ? 'lost'
        : questionIndex >= state.questions.length
          ? 'exhausted'
          : 'in_progress';
  return {
    ...state,
    bossHp,
    playerHp,
    score: state.score + bossDamage,
    status,
    questionIndex,
    answeredQuestionIds,
  };
}
