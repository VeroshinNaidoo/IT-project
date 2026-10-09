/** @typedef {'none'|'practice'} GameScoringPolicy */

/**
 * Future game modules implement this plain interface. No game is scored.
 * @typedef {{key: string, buildFromQuiz: (quiz: object) => object, validate: (gameData: object) => boolean, scoring: GameScoringPolicy}} GameModule
 */

export const gameModuleContract = Object.freeze({
  required: ['key', 'buildFromQuiz', 'validate', 'scoring'],
  allowedScoring: ['none', 'practice'],
});
