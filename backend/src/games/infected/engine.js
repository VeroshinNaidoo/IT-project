// @ts-nocheck - pure runtime engine is covered by transition and property tests.
const transitions = Object.freeze({
  easy: Object.freeze({ reward: 10, penalty: 5 }),
  medium: Object.freeze({ reward: 20, penalty: 10 }),
  hard: Object.freeze({ reward: 30, penalty: 15 }),
});

const clamp = (value, minimum, maximum) =>
  Math.min(maximum, Math.max(minimum, value));

export const rewardFor = (difficulty) => {
  const transition = transitions[difficulty];
  if (!transition) throw new Error('INVALID_GAME_DIFFICULTY');
  return transition;
};

export const isTerminal = (state) =>
  ['won', 'lost', 'exhausted'].includes(state.status);

export function applyAnswer(state, difficulty, isCorrect) {
  if (isTerminal(state)) throw new Error('GAME_SESSION_FINISHED');
  const { reward, penalty } = rewardFor(difficulty);
  const cure = clamp(state.cure + (isCorrect ? reward : -penalty), 0, 100);
  const hearts = clamp(state.hearts - (isCorrect ? 0 : 1), 0, 3);
  const score = state.score + (isCorrect ? reward : 0);
  const status = cure === 100 ? 'won' : hearts === 0 ? 'lost' : 'in_progress';
  return { cure, hearts, score, status };
}

const shuffled = (items, rng) => {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(rng() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
};

export function selectCards(unusedQuestions, rng = Math.random) {
  const remaining = [...unusedQuestions];
  const selected = [];
  for (const difficulty of ['easy', 'medium', 'hard']) {
    const candidates = remaining.filter(
      (question) => question.difficulty === difficulty,
    );
    if (!candidates.length) continue;
    const choice = shuffled(candidates, rng)[0];
    selected.push(choice);
    remaining.splice(
      remaining.findIndex(
        (question) => question.question_id === choice.question_id,
      ),
      1,
    );
  }
  if (selected.length < 3)
    selected.push(...shuffled(remaining, rng).slice(0, 3 - selected.length));
  return selected.slice(0, 3);
}

export function finalizeIfExhausted(state, cards) {
  if (isTerminal(state) || cards.length) return state;
  return { ...state, status: 'exhausted' };
}

export const infectedGameModule = Object.freeze({
  key: 'infected',
  buildFromQuiz: (quiz) => ({ questions: quiz.questions || [] }),
  validate: (gameData) =>
    Array.isArray(gameData?.questions) && gameData.questions.length > 0,
  scoring: 'practice',
});
