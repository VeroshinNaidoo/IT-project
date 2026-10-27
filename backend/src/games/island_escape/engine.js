// @ts-nocheck - pure engine state is validated by the game-owned Zod schema.
import {
  ISLAND_BASE_POINTS,
  ISLAND_BOAT_PARTS,
  ISLAND_DOUBLE_MULTIPLIER,
  ISLAND_INITIAL_PHASE_ATTEMPT,
  ISLAND_MATERIALS,
  ISLAND_MAX_SETBACKS,
  ISLAND_MIN_QUESTIONS,
  ISLAND_PHASES,
  ISLAND_QUESTIONS_PER_PHASE,
  ISLAND_STATE_VERSION,
  ISLAND_STREAK_FOR_DOUBLE,
  ISLAND_WRONG_LIMIT,
} from './config.js';

export const isTerminal = (state) =>
  ['won', 'lost', 'exhausted'].includes(state.status);

export const initialIslandState = () => ({
  version: ISLAND_STATE_VERSION,
  phase: 1,
  phaseAttempt: ISLAND_INITIAL_PHASE_ATTEMPT,
  phaseQuestionNumber: 0,
  wrongInPhase: 0,
  streak: 0,
  doubleActive: false,
  setbacks: 0,
  score: 0,
  materials: [],
  boatParts: [],
  sailProgress: 0,
  askedQuestionIds: [],
  phaseQuestionIds: [],
  currentQuestionId: null,
  status: 'in_progress',
  lastEvent: 'started',
  pointsEarned: 0,
});

function progressForCorrect(state) {
  if (state.phase === 1)
    return {
      materials: [
        ...state.materials,
        ISLAND_MATERIALS[state.materials.length % ISLAND_MATERIALS.length],
      ],
    };
  if (state.phase === 2)
    return {
      boatParts: [
        ...state.boatParts,
        ISLAND_BOAT_PARTS[state.boatParts.length % ISLAND_BOAT_PARTS.length],
      ],
    };
  return { sailProgress: state.sailProgress + 1 };
}

function applySetback(state) {
  const setbacks = state.setbacks + 1;
  const terminal = setbacks > ISLAND_MAX_SETBACKS;
  const event = ISLAND_PHASES[state.phase].setback;
  let phase = state.phase;
  let materials = state.materials;
  let boatParts = state.boatParts;
  let sailProgress = state.sailProgress;
  if (state.phase === 1) materials = [];
  if (state.phase === 2) boatParts = [];
  if (state.phase === 3) {
    phase = 2;
    boatParts = [];
    sailProgress = 0;
  }
  return {
    ...state,
    phase,
    phaseAttempt: state.phaseAttempt + 1,
    phaseQuestionNumber: 0,
    wrongInPhase: 0,
    streak: 0,
    doubleActive: false,
    setbacks,
    materials,
    boatParts,
    sailProgress,
    phaseQuestionIds: [],
    currentQuestionId: null,
    status: terminal ? 'lost' : 'in_progress',
    lastEvent: terminal ? 'stranded' : event,
    pointsEarned: 0,
  };
}

export function applyAnswer(state, isCorrect) {
  if (isTerminal(state)) throw new Error('ISLAND_PLAY_FINISHED');
  const pointsEarned = isCorrect
    ? ISLAND_BASE_POINTS * (state.doubleActive ? ISLAND_DOUBLE_MULTIPLIER : 1)
    : 0;
  const streak = isCorrect ? state.streak + 1 : 0;
  const wrongInPhase = state.wrongInPhase + (isCorrect ? 0 : 1);
  let next = {
    ...state,
    ...(isCorrect ? progressForCorrect(state) : {}),
    phaseQuestionNumber: state.phaseQuestionNumber + 1,
    wrongInPhase,
    streak,
    doubleActive: isCorrect && streak >= ISLAND_STREAK_FOR_DOUBLE,
    score: state.score + pointsEarned,
    currentQuestionId: null,
    lastEvent: isCorrect ? 'correct' : 'incorrect',
    pointsEarned,
  };
  if (wrongInPhase >= ISLAND_WRONG_LIMIT) return applySetback(next);
  if (next.phaseQuestionNumber < ISLAND_QUESTIONS_PER_PHASE) return next;
  if (next.phase === 3)
    return {
      ...next,
      status: 'won',
      lastEvent: 'reached_mainland',
      currentQuestionId: null,
    };
  return {
    ...next,
    phase: next.phase + 1,
    phaseAttempt: next.phaseAttempt + 1,
    phaseQuestionNumber: 0,
    wrongInPhase: 0,
    phaseQuestionIds: [],
    currentQuestionId: null,
    lastEvent: 'phase_advanced',
  };
}

const shuffled = (items, rng) => {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(rng() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
};

const levelDistance = (level, preferred) =>
  Math.min(...preferred.map((candidate) => Math.abs(candidate - level)));

export function selectQuestions(pool, state, rng = Math.random) {
  const preferred = ISLAND_PHASES[state.phase].preferredLevels;
  const history = state.askedQuestionIds || [];
  const lastSeen = new Map();
  history.forEach((id, index) => lastSeen.set(id, index));
  const order = (items, recycling) =>
    shuffled(items, rng).sort((left, right) => {
      if (recycling) {
        const seen =
          (lastSeen.get(left.question_id) ?? -1) -
          (lastSeen.get(right.question_id) ?? -1);
        if (seen) return seen;
      }
      return (
        levelDistance(left.difficulty_level, preferred) -
        levelDistance(right.difficulty_level, preferred)
      );
    });
  const unused = order(
    pool.filter((question) => !lastSeen.has(question.question_id)),
    false,
  );
  const selected = unused.slice(0, ISLAND_QUESTIONS_PER_PHASE);
  if (selected.length < ISLAND_QUESTIONS_PER_PHASE) {
    const selectedIds = new Set(selected.map((item) => item.question_id));
    selected.push(
      ...order(
        pool.filter((item) => !selectedIds.has(item.question_id)),
        true,
      ).slice(0, ISLAND_QUESTIONS_PER_PHASE - selected.length),
    );
  }
  return selected;
}

export function rebuildState(moves, initial = initialIslandState()) {
  return moves.reduce(
    (state, move) => applyAnswer(state, move.isCorrect),
    initial,
  );
}

export const islandEscapeGameModule = Object.freeze({
  key: 'island_escape',
  buildFromQuiz: (quiz) => ({ questions: quiz.questions || [] }),
  validate: (gameData) =>
    Array.isArray(gameData?.questions) &&
    gameData.questions.length >= ISLAND_MIN_QUESTIONS,
  scoring: 'practice',
});
