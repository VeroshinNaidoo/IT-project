// @ts-nocheck - runtime records are validated through Zod and SQL constraints.
import { z } from 'zod';
import { canAccessGame } from '../access.js';
import { tierOf } from '../difficulty.js';
import { validateGameState } from '../play-state.js';
import {
  ISLAND_MAX_SETBACKS,
  ISLAND_MIN_QUESTIONS,
  ISLAND_PHASES,
  ISLAND_QUESTIONS_PER_PHASE,
} from './config.js';
import { applyAnswer, initialIslandState, selectQuestions } from './engine.js';
import './state.js';

const startSchema = z.object({ quizId: z.string().uuid() }).strict();
const answerSchema = z.object({ optionId: z.string().uuid() }).strict();
const emptySchema = z.object({}).strict();

export function registerIslandEscapeRoutes({
  app,
  pool,
  requireAuth,
  error,
  requestId,
}) {
  const parse = (schema, value, req, res) => {
    const result = schema.safeParse(value);
    if (result.success) return result.data;
    error(
      res,
      422,
      'VALIDATION_ERROR',
      'Please check the submitted fields.',
      requestId(req),
    );
    return null;
  };

  const publicState = (rowOrState, playId) => {
    const state = rowOrState.state || rowOrState;
    return {
      playId: playId || rowOrState.play_id,
      phase: state.phase,
      phaseName: ISLAND_PHASES[state.phase].name,
      phaseQuestionNumber: state.phaseQuestionNumber,
      wrongInPhase: state.wrongInPhase,
      streak: state.streak,
      doubleActive: state.doubleActive,
      setbacks: state.setbacks,
      retriesRemaining: Math.max(0, ISLAND_MAX_SETBACKS - state.setbacks),
      score: state.score,
      materials: state.materials,
      boatParts: state.boatParts,
      sailProgress: state.sailProgress,
      status: state.status,
      event: state.lastEvent,
    };
  };

  const loadPlay = async (client, playId, actorId, lock = false) => {
    const result = await client.query(
      `SELECT p.*,gt.key FROM game_plays p
       JOIN game_types gt ON gt.game_type_id=p.game_type_id
       WHERE p.play_id=$1 AND p.student_id=$2 AND gt.key='island_escape'
       ${lock ? 'FOR UPDATE OF p' : ''}`,
      [playId, actorId],
    );
    return result.rows[0] || null;
  };

  const questionPayload = async (client, questionId) => {
    if (!questionId) return null;
    const question = (
      await client.query(
        `SELECT q.question_id,q.question_text,q.difficulty_level,t.name AS topic
         FROM questions q LEFT JOIN topics t ON t.topic_id=q.topic_id
         WHERE q.question_id=$1`,
        [questionId],
      )
    ).rows[0];
    if (!question) return null;
    const options = await client.query(
      `SELECT option_id,option_text FROM question_options
       WHERE question_id=$1 ORDER BY option_id`,
      [questionId],
    );
    return {
      questionId: question.question_id,
      questionText: question.question_text,
      difficultyLevel: question.difficulty_level,
      difficulty: tierOf(question.difficulty_level),
      topic: question.topic || 'General',
      options: options.rows.map((option) => ({
        optionId: option.option_id,
        optionText: option.option_text,
      })),
    };
  };

  const preparePhase = async (client, state, quizId) => {
    const poolRows = (
      await client.query(
        `SELECT question_id,difficulty_level FROM questions
         WHERE quiz_id=$1 AND question_type NOT IN ('short_answer','code') ORDER BY question_id`,
        [quizId],
      )
    ).rows;
    const selected = selectQuestions(poolRows, state);
    if (selected.length < ISLAND_QUESTIONS_PER_PHASE)
      return {
        ...state,
        status: 'exhausted',
        lastEvent: 'exhausted',
        currentQuestionId: null,
        phaseQuestionIds: [],
      };
    const phaseQuestionIds = selected.map((question) => question.question_id);
    const currentQuestionId = phaseQuestionIds[0];
    return {
      ...state,
      phaseQuestionIds,
      currentQuestionId,
      askedQuestionIds: [...state.askedQuestionIds, currentQuestionId],
    };
  };

  const advanceQuestion = async (client, state, quizId) => {
    if (state.status !== 'in_progress') return state;
    if (!state.phaseQuestionIds.length)
      return preparePhase(client, state, quizId);
    const currentQuestionId = state.phaseQuestionIds[state.phaseQuestionNumber];
    if (!currentQuestionId)
      return { ...state, status: 'exhausted', lastEvent: 'exhausted' };
    return {
      ...state,
      currentQuestionId,
      askedQuestionIds: [...state.askedQuestionIds, currentQuestionId],
    };
  };

  const personalBest = async (client, typeId, actorId, quizId) => {
    const result = await client.query(
      `SELECT score FROM game_personal_bests
       WHERE game_type_id=$1 AND student_id=$2 AND quiz_id=$3`,
      [typeId, actorId, quizId],
    );
    return result.rowCount ? result.rows[0].score : null;
  };

  const responseForState = async (client, play, state = play.state) => ({
    play: publicState(state, play.play_id),
    question:
      state.status === 'in_progress'
        ? await questionPayload(client, state.currentQuestionId)
        : null,
    personalBest: await personalBest(
      client,
      play.game_type_id,
      play.student_id,
      play.quiz_id,
    ),
  });

  const authorizeQuiz = async (client, req, res, quizId) => {
    const quiz = (
      await client.query(
        `SELECT q.*,m.lecturer_id FROM quizzes q
         JOIN modules m ON m.module_id=q.module_id WHERE q.quiz_id=$1`,
        [quizId],
      )
    ).rows[0];
    if (!quiz) {
      error(res, 404, 'NOT_FOUND', 'Quiz not found.', requestId(req));
      return null;
    }
    let scoredAttemptCompleted = false;
    if (req.user.role === 'student') {
      const enrolled = await client.query(
        `SELECT 1 FROM enrollments WHERE module_id=$1 AND student_id=$2`,
        [quiz.module_id, req.user.userId],
      );
      if (!enrolled.rowCount) {
        error(
          res,
          403,
          'FORBIDDEN',
          'You are not enrolled in this module.',
          requestId(req),
        );
        return null;
      }
      scoredAttemptCompleted = Boolean(
        (
          await client.query(
            `SELECT 1 FROM quiz_attempts WHERE quiz_id=$1 AND student_id=$2
             AND is_scored=true AND completion_time IS NOT NULL`,
            [quizId, req.user.userId],
          )
        ).rowCount,
      );
    } else if (
      req.user.role !== 'lecturer' ||
      quiz.lecturer_id !== req.user.userId
    ) {
      error(
        res,
        403,
        'FORBIDDEN',
        'You do not manage this quiz.',
        requestId(req),
      );
      return null;
    }
    if (!canAccessGame(req.user, quiz, { scoredAttemptCompleted })) {
      error(
        res,
        403,
        'GAME_LOCKED',
        'Complete your scored attempt to unlock this game.',
        requestId(req),
      );
      return null;
    }
    return quiz;
  };

  app.post(
    '/api/v1/games/island-escape/plays',
    requireAuth,
    async (req, res, next) => {
      const data = parse(startSchema, req.body || {}, req, res);
      if (!data) return;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const quiz = await authorizeQuiz(client, req, res, data.quizId);
        if (!quiz) return await client.query('ROLLBACK');
        const count = Number(
          (
            await client.query(
              'SELECT count(*)::int AS count FROM questions WHERE quiz_id=$1',
              [data.quizId],
            )
          ).rows[0].count,
        );
        if (count < ISLAND_MIN_QUESTIONS) {
          await client.query('ROLLBACK');
          return error(
            res,
            409,
            'NOT_ENOUGH_QUESTIONS',
            `Needs a quiz with at least ${ISLAND_MIN_QUESTIONS} questions.`,
            requestId(req),
          );
        }
        const type = (
          await client.query(
            `SELECT game_type_id FROM game_types
             WHERE key='island_escape' AND is_enabled=true`,
          )
        ).rows[0];
        if (!type) {
          await client.query('ROLLBACK');
          return error(
            res,
            409,
            'GAME_DISABLED',
            'Island Escape is not available.',
            requestId(req),
          );
        }
        let play = (
          await client.query(
            `SELECT * FROM game_plays WHERE game_type_id=$1 AND student_id=$2
             AND quiz_id=$3 AND mode='solo' AND status='in_progress' FOR UPDATE`,
            [type.game_type_id, req.user.userId, data.quizId],
          )
        ).rows[0];
        let resumed = Boolean(play);
        if (!play) {
          const state = validateGameState(
            'island_escape',
            await preparePhase(client, initialIslandState(), data.quizId),
          );
          play = (
            await client.query(
              `INSERT INTO game_plays(game_type_id,student_id,quiz_id,state,score)
               VALUES($1,$2,$3,$4::jsonb,0) RETURNING *`,
              [
                type.game_type_id,
                req.user.userId,
                data.quizId,
                JSON.stringify(state),
              ],
            )
          ).rows[0];
          resumed = false;
        }
        const payload = await responseForState(client, play);
        await client.query('COMMIT');
        res.status(resumed ? 200 : 201).json({ ...payload, resumed });
      } catch (caught) {
        await client.query('ROLLBACK').catch(() => {});
        next(caught);
      } finally {
        client.release();
      }
    },
  );

  app.get(
    '/api/v1/games/island-escape/plays/:id',
    requireAuth,
    async (req, res, next) => {
      try {
        if (!parse(emptySchema, req.body || {}, req, res)) return;
        const play = await loadPlay(pool, req.params.id, req.user.userId);
        if (!play)
          return error(
            res,
            404,
            'NOT_FOUND',
            'Game play not found.',
            requestId(req),
          );
        res.json(await responseForState(pool, play));
      } catch (caught) {
        next(caught);
      }
    },
  );

  app.post(
    '/api/v1/games/island-escape/plays/:id/answer',
    requireAuth,
    async (req, res, next) => {
      const data = parse(answerSchema, req.body || {}, req, res);
      if (!data) return;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const play = await loadPlay(
          client,
          req.params.id,
          req.user.userId,
          true,
        );
        if (!play) {
          await client.query('ROLLBACK');
          return error(
            res,
            404,
            'NOT_FOUND',
            'Game play not found.',
            requestId(req),
          );
        }
        const replay = (
          await client.query(
            `SELECT * FROM game_play_moves
             WHERE play_id=$1 AND option_id=$2 ORDER BY move_number DESC LIMIT 1`,
            [play.play_id, data.optionId],
          )
        ).rows[0];
        if (replay) {
          const stored = replay.payload;
          const response = await responseForState(
            client,
            play,
            replay.state_after,
          );
          await client.query('COMMIT');
          return res.json({ ...stored, ...response, replayed: true });
        }
        if (play.status !== 'in_progress') {
          await client.query('ROLLBACK');
          return error(
            res,
            409,
            'GAME_FINISHED',
            'This Island Escape play has finished.',
            requestId(req),
          );
        }
        const state = validateGameState('island_escape', play.state);
        const selected = (
          await client.query(
            `SELECT o.option_id,o.option_text,o.is_correct,q.explanation
             FROM question_options o JOIN questions q ON q.question_id=o.question_id
             WHERE o.option_id=$1 AND o.question_id=$2`,
            [data.optionId, state.currentQuestionId],
          )
        ).rows[0];
        if (!selected) {
          await client.query('ROLLBACK');
          return error(
            res,
            409,
            'INVALID_OPTION',
            'That option does not belong to the current question.',
            requestId(req),
          );
        }
        const correctOption = (
          await client.query(
            `SELECT option_id,option_text FROM question_options
             WHERE question_id=$1 AND is_correct=true`,
            [state.currentQuestionId],
          )
        ).rows[0];
        let nextState = applyAnswer(state, selected.is_correct);
        nextState = await advanceQuestion(client, nextState, play.quiz_id);
        nextState = validateGameState('island_escape', nextState);
        const moveNumber = Number(
          (
            await client.query(
              `SELECT count(*)::int+1 AS next FROM game_play_moves WHERE play_id=$1`,
              [play.play_id],
            )
          ).rows[0].next,
        );
        const stored = {
          isCorrect: selected.is_correct,
          correctOption: {
            optionId: correctOption.option_id,
            optionText: correctOption.option_text,
          },
          explanation:
            selected.explanation ||
            `The correct answer is ${correctOption.option_text}.`,
          pointsEarned: nextState.pointsEarned,
          event: nextState.lastEvent,
        };
        await client.query(
          `INSERT INTO game_play_moves(
             play_id,move_number,move_type,payload,state_after,
             question_id,option_id,phase_attempt
           ) VALUES($1,$2,'answer',$3::jsonb,$4::jsonb,$5,$6,$7)`,
          [
            play.play_id,
            moveNumber,
            JSON.stringify(stored),
            JSON.stringify(nextState),
            state.currentQuestionId,
            data.optionId,
            state.phaseAttempt,
          ],
        );
        const completedAt =
          nextState.status === 'in_progress' ? null : new Date().toISOString();
        await client.query(
          `UPDATE game_plays SET state=$1::jsonb,score=$2,status=$3,completed_at=$4
           WHERE play_id=$5`,
          [
            JSON.stringify(nextState),
            nextState.score,
            nextState.status,
            completedAt,
            play.play_id,
          ],
        );
        if (nextState.status !== 'in_progress')
          await client.query(
            `INSERT INTO game_personal_bests(game_type_id,student_id,quiz_id,score)
             VALUES($1,$2,$3,$4)
             ON CONFLICT(game_type_id,student_id,quiz_id) DO UPDATE
             SET score=greatest(game_personal_bests.score,EXCLUDED.score),
                 achieved_at=CASE WHEN EXCLUDED.score>game_personal_bests.score
                                  THEN now() ELSE game_personal_bests.achieved_at END`,
            [play.game_type_id, play.student_id, play.quiz_id, nextState.score],
          );
        const response = await responseForState(client, play, nextState);
        await client.query('COMMIT');
        res.json({ ...stored, ...response, replayed: false });
      } catch (caught) {
        await client.query('ROLLBACK').catch(() => {});
        next(caught);
      } finally {
        client.release();
      }
    },
  );
}
