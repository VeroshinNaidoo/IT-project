// @ts-nocheck - pure engine state is covered by transition and property tests.
import {
  EXTENDED_TIME_MULTIPLIER,
  POINTS_BY_LEVEL,
  TRIVIA_MAX_TOPICS,
  TRIVIA_MIN_QUESTIONS,
  TRIVIA_ROUNDS,
  TRIVIA_SECONDS,
} from './config.js';

const questionIdOf = (question) =>
  question.question_id ?? question.questionId ?? question.id;
const levelOf = (question) =>
  question.difficulty_level ?? question.difficultyLevel;
const topicOf = (question) =>
  question.topic_name ?? question.topicName ?? question.topic;

const seededRng = (seed) => {
  const text = String(seed ?? 'timer-trivia');
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

const shuffle = (items, rng) => {
  const result = [...items];
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
    const level = Number(levelOf(question));
    const topic = topicOf(question);
    if (
      id === undefined ||
      id === null ||
      seen.has(String(id)) ||
      !Object.hasOwn(POINTS_BY_LEVEL, level) ||
      typeof topic !== 'string' ||
      topic.trim().length === 0
    )
      return false;
    seen.add(String(id));
    return true;
  });
};

const makeBoard = (questions, rng) => {
  const topicCounts = new Map();
  for (const question of questions) {
    const topic = topicOf(question).trim();
    topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
  }
  const topics = [...topicCounts]
    .sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
    )
    .slice(0, TRIVIA_MAX_TOPICS)
    .map(([topic]) => topic);
  const cells = [];
  for (const topic of topics) {
    for (let level = 1; level <= 5; level += 1) {
      const candidates = questions.filter(
        (question) =>
          topicOf(question).trim() === topic &&
          Number(levelOf(question)) === level,
      );
      if (candidates.length === 0) continue;
      const question = shuffle(candidates, rng)[0];
      cells.push({
        cellId: `${topics.indexOf(topic)}-${level}`,
        topic,
        level,
        points: POINTS_BY_LEVEL[level],
        question,
        state: 'open',
      });
    }
  }
  return { topics, cells };
};

export const isTerminal = (state) => state.status === 'finished';

export function createGame(questions, seed = 'timer-trivia') {
  const eligible = eligibleQuestions(questions);
  if (eligible.length < TRIVIA_MIN_QUESTIONS)
    throw new Error('TIMER_TRIVIA_NOT_ENOUGH_QUESTIONS');
  const rng = typeof seed === 'function' ? seed : seededRng(seed);
  const board = makeBoard(eligible, rng);
  if (board.cells.length < TRIVIA_ROUNDS)
    throw new Error('TIMER_TRIVIA_NOT_ENOUGH_BOARD_CELLS');
  return {
    status: 'in_progress',
    score: 0,
    roundsCompleted: 0,
    topics: board.topics,
    cells: board.cells,
    currentCellId: null,
    questionStartedAt: null,
    deadlineAt: null,
    extendedTime: false,
    answeredQuestionIds: [],
  };
}

export function currentQuestion(state) {
  if (isTerminal(state) || state.currentCellId === null) return null;
  return (
    state.cells.find((cell) => cell.cellId === state.currentCellId)?.question ??
    null
  );
}

export function chooseCell(state, cellId, now, extendedTime = false) {
  if (isTerminal(state)) throw new Error('TIMER_TRIVIA_FINISHED');
  if (state.currentCellId !== null)
    throw new Error('TIMER_TRIVIA_ROUND_ACTIVE');
  const cell = state.cells.find((candidate) => candidate.cellId === cellId);
  if (!cell || cell.state !== 'open')
    throw new Error('TIMER_TRIVIA_CELL_UNAVAILABLE');
  const startedAt = new Date(now).getTime();
  if (!Number.isFinite(startedAt)) throw new Error('TIMER_TRIVIA_INVALID_TIME');
  const multiplier = extendedTime ? EXTENDED_TIME_MULTIPLIER : 1;
  return {
    ...state,
    currentCellId: cellId,
    questionStartedAt: new Date(startedAt).toISOString(),
    deadlineAt: new Date(
      startedAt + TRIVIA_SECONDS * 1000 * multiplier,
    ).toISOString(),
    extendedTime: Boolean(extendedTime),
  };
}

export function applyAnswer(state, isCorrect, now) {
  if (isTerminal(state)) throw new Error('TIMER_TRIVIA_FINISHED');
  if (state.currentCellId === null)
    throw new Error('TIMER_TRIVIA_NO_ACTIVE_ROUND');
  const cell = state.cells.find(
    (candidate) => candidate.cellId === state.currentCellId,
  );
  if (!cell || cell.state !== 'open')
    throw new Error('TIMER_TRIVIA_CELL_UNAVAILABLE');
  const answeredAt = new Date(now).getTime();
  if (!Number.isFinite(answeredAt))
    throw new Error('TIMER_TRIVIA_INVALID_TIME');
  const timedOut = answeredAt > new Date(state.deadlineAt).getTime();
  const pointsDelta = !timedOut && Boolean(isCorrect) ? cell.points : 0;
  const roundsCompleted = state.roundsCompleted + 1;
  const cells = state.cells.map((candidate) =>
    candidate.cellId === cell.cellId
      ? { ...candidate, state: 'answered' }
      : candidate,
  );
  const status =
    roundsCompleted >= TRIVIA_ROUNDS ||
    !cells.some((candidate) => candidate.state === 'open')
      ? 'finished'
      : 'in_progress';
  return {
    ...state,
    status,
    score: state.score + pointsDelta,
    roundsCompleted,
    cells,
    currentCellId: null,
    questionStartedAt: null,
    deadlineAt: null,
    extendedTime: false,
    answeredQuestionIds: [
      ...state.answeredQuestionIds,
      String(questionIdOf(cell.question)),
    ],
    lastResult: {
      cellId: cell.cellId,
      questionId: String(questionIdOf(cell.question)),
      isCorrect: !timedOut && Boolean(isCorrect),
      timedOut,
      pointsDelta,
      answeredAt: new Date(answeredAt).toISOString(),
    },
  };
}
