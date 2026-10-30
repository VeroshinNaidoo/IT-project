// @ts-nocheck - runtime records are validated through Zod and SQL constraints.
import crypto from 'node:crypto';
import { z } from 'zod';
import { canAccessGame } from '../access.js';
import { validateGameState } from '../play-state.js';
import { TRIVIA_MIN_QUESTIONS, TRIVIA_ROUNDS } from './config.js';
import {
  applyAnswer,
  chooseCell,
  createGame,
  currentQuestion,
} from './engine.js';
import { TIMER_TRIVIA_STATE_VERSION } from './state.js';

const startSchema = z.object({ quizId: z.string().uuid() }).strict();
const chooseSchema = z.object({ cellId: z.string().min(1) }).strict();
const answerSchema = z.object({ optionId: z.string().uuid() }).strict();
const emptySchema = z.object({}).strict();

export function registerTimerTriviaRoutes({
  app,
  pool,
  requireAuth,
  error,
  requestId,
}) {
  const parse = (schema, req, res) => {
    const parsed = schema.safeParse(req.body || {});
    if (parsed.success) return parsed.data;
    error(
      res,
      422,
      'VALIDATION_ERROR',
      'Please check the submitted fields.',
      requestId(req),
    );
    return null;
  };

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
        'SELECT 1 FROM enrollments WHERE module_id=$1 AND student_id=$2',
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
            `SELECT 1 FROM quiz_attempts
             WHERE quiz_id=$1 AND student_id=$2 AND is_scored=true
               AND completion_time IS NOT NULL`,
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

  const eligibleQuestions = async (client, quizId) =>
    (
      await client.query(
        `SELECT q.question_id,q.difficulty_level,coalesce(t.name,'General') AS topic_name
         FROM questions q LEFT JOIN topics t ON t.topic_id=q.topic_id
         WHERE q.quiz_id=$1
           AND EXISTS (SELECT 1 FROM question_options o
                       WHERE o.question_id=q.question_id AND o.is_correct=true)
           AND (SELECT count(*) FROM question_options o
                WHERE o.question_id=q.question_id) >= 2
         ORDER BY q.question_id`,
        [quizId],
      )
    ).rows;

  const loadPlay = async (client, playId, actorId, lock = false) =>
    (
      await client.query(
        `SELECT p.* FROM game_plays p
         JOIN game_types gt ON gt.game_type_id=p.game_type_id
         WHERE p.play_id=$1 AND p.student_id=$2 AND gt.key='timer_trivia'
         ${lock ? 'FOR UPDATE OF p' : ''}`,
        [playId, actorId],
      )
    ).rows[0] || null;

  const rebuildState = async (client, play) => {
    const latest = (
      await client.query(
        `SELECT state_after FROM game_play_moves
         WHERE play_id=$1 ORDER BY move_number DESC LIMIT 1`,
        [play.play_id],
      )
    ).rows[0];
    return validateGameState('timer_trivia', latest?.state_after || play.state);
  };

  const questionPayload = async (client, question) => {
    if (!question) return null;
    const row = (
      await client.query(
        `SELECT q.question_id,q.question_text,q.difficulty_level,t.name AS topic
         FROM questions q LEFT JOIN topics t ON t.topic_id=q.topic_id
         WHERE q.question_id=$1`,
        [question.question_id],
      )
    ).rows[0];
    const options = await client.query(
      `SELECT option_id,option_text FROM question_options
       WHERE question_id=$1 ORDER BY option_id`,
      [row.question_id],
    );
    return {
      questionId: row.question_id,
      questionText: row.question_text,
      difficultyLevel: row.difficulty_level,
      topic: row.topic || 'General',
      options: options.rows.map((option) => ({
        optionId: option.option_id,
        optionText: option.option_text,
      })),
    };
  };

  const publicPlay = (play, state) => ({
    playId: play.play_id,
    quizId: play.quiz_id,
    status: state.status,
    score: state.score,
    roundsCompleted: state.roundsCompleted,
    roundsRemaining: TRIVIA_ROUNDS - state.roundsCompleted,
    topics: state.topics,
    board: state.cells.map(
      ({ cellId, topic, level, points, state: cellState }) => ({
        cellId,
        topic,
        level,
        points,
        state: cellState,
        disabled: cellState !== 'open',
      }),
    ),
    activeCellId: state.currentCellId,
    deadlineAt: state.deadlineAt,
    extendedTime: state.extendedTime,
  });

  const responseForState = async (client, play, state) => ({
    play: publicPlay(play, state),
    question: state.currentCellId
      ? await questionPayload(client, currentQuestion(state))
      : null,
  });

  const appendMove = async (
    client,
    play,
    moveType,
    payload,
    state,
    questionId = null,
    optionId = null,
  ) => {
    const moveNumber = Number(
      (
        await client.query(
          `SELECT count(*)::int+1 AS next FROM game_play_moves WHERE play_id=$1`,
          [play.play_id],
        )
      ).rows[0].next,
    );
    await client.query(
      `INSERT INTO game_play_moves(
         play_id,move_number,move_type,payload,state_after,question_id,option_id,phase_attempt
       ) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8)`,
      [
        play.play_id,
        moveNumber,
        moveType,
        JSON.stringify(payload),
        JSON.stringify(state),
        questionId,
        optionId,
        questionId ? 1 : null,
      ],
    );
  };

  app.post(
    '/api/v1/games/timer-trivia/plays',
    requireAuth,
    async (req, res, next) => {
      const data = parse(startSchema, req, res);
      if (!data) return;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const quiz = await authorizeQuiz(client, req, res, data.quizId);
        if (!quiz) return await client.query('ROLLBACK');
        const questions = await eligibleQuestions(client, data.quizId);
        if (questions.length < TRIVIA_MIN_QUESTIONS) {
          await client.query('ROLLBACK');
          return error(
            res,
            409,
            'NOT_ENOUGH_QUESTIONS',
            `Timer Trivia needs at least ${TRIVIA_MIN_QUESTIONS} eligible questions.`,
            requestId(req),
          );
        }
        const type = (
          await client.query(
            `SELECT game_type_id,is_enabled FROM game_types WHERE key='timer_trivia'`,
          )
        ).rows[0];
        if (!type?.is_enabled) {
          await client.query('ROLLBACK');
          return error(
            res,
            409,
            'GAME_DISABLED',
            'Timer Trivia is not available yet.',
            requestId(req),
          );
        }
        let play = (
          await client.query(
            `SELECT * FROM game_plays
             WHERE game_type_id=$1 AND student_id=$2 AND quiz_id=$3
               AND mode='solo' AND status='in_progress' FOR UPDATE`,
            [type.game_type_id, req.user.userId, data.quizId],
          )
        ).rows[0];
        const resumed = Boolean(play);
        if (!play) {
          const serverSeed = crypto.randomBytes(16).toString('hex');
          let game;
          try {
            game = createGame(questions, serverSeed);
          } catch (caught) {
            if (caught.message !== 'TIMER_TRIVIA_NOT_ENOUGH_BOARD_CELLS')
              throw caught;
            await client.query('ROLLBACK');
            return error(
              res,
              409,
              'NOT_ENOUGH_BOARD_CELLS',
              'Timer Trivia needs at least ten topic and difficulty cells.',
              requestId(req),
            );
          }
          const state = validateGameState('timer_trivia', {
            ...game,
            version: TIMER_TRIVIA_STATE_VERSION,
            serverSeed,
            startedAt: new Date().toISOString(),
          });
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
        }
        const state = await rebuildState(client, play);
        const response = await responseForState(client, play, state);
        await client.query('COMMIT');
        res
          .status(resumed ? 200 : 201)
          .json({ data: { ...response, resumed } });
      } catch (caught) {
        await client.query('ROLLBACK').catch(() => {});
        next(caught);
      } finally {
        client.release();
      }
    },
  );

  app.get(
    '/api/v1/games/timer-trivia/plays/:id',
    requireAuth,
    async (req, res, next) => {
      try {
        if (!parse(emptySchema, req, res)) return;
        const play = await loadPlay(pool, req.params.id, req.user.userId);
        if (!play)
          return error(
            res,
            404,
            'NOT_FOUND',
            'Game play not found.',
            requestId(req),
          );
        const state = await rebuildState(pool, play);
        res.json({ data: await responseForState(pool, play, state) });
      } catch (caught) {
        next(caught);
      }
    },
  );

  app.post(
    '/api/v1/games/timer-trivia/plays/:id/choose',
    requireAuth,
    async (req, res, next) => {
      const data = parse(chooseSchema, req, res);
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
        const state = await rebuildState(client, play);
        if (state.currentCellId === data.cellId) {
          const response = await responseForState(client, play, state);
          await client.query('COMMIT');
          return res.json({ data: { ...response, replayed: true } });
        }
        if (state.currentCellId !== null) {
          await client.query('ROLLBACK');
          return error(
            res,
            409,
            'ROUND_ACTIVE',
            'Finish the current question before choosing another cell.',
            requestId(req),
          );
        }
        if (state.status !== 'in_progress') {
          await client.query('ROLLBACK');
          return error(
            res,
            409,
            'GAME_FINISHED',
            'This Timer Trivia play has finished.',
            requestId(req),
          );
        }
        const preference = (
          await client.query(
            'SELECT extended_time FROM users WHERE user_id=$1',
            [req.user.userId],
          )
        ).rows[0];
        let nextState;
        try {
          nextState = validateGameState(
            'timer_trivia',
            chooseCell(
              state,
              data.cellId,
              new Date(),
              preference.extended_time,
            ),
          );
        } catch (caught) {
          if (caught.message !== 'TIMER_TRIVIA_CELL_UNAVAILABLE') throw caught;
          await client.query('ROLLBACK');
          return error(
            res,
            409,
            'CELL_UNAVAILABLE',
            'That cell is no longer available.',
            requestId(req),
          );
        }
        const response = await responseForState(client, play, nextState);
        await appendMove(
          client,
          play,
          'choose',
          { cellId: data.cellId },
          nextState,
        );
        await client.query(
          'UPDATE game_plays SET state=$1::jsonb WHERE play_id=$2',
          [JSON.stringify(nextState), play.play_id],
        );
        await client.query('COMMIT');
        res.json({ data: { ...response, replayed: false } });
      } catch (caught) {
        await client.query('ROLLBACK').catch(() => {});
        next(caught);
      } finally {
        client.release();
      }
    },
  );

  app.post(
    '/api/v1/games/timer-trivia/plays/:id/answer',
    requireAuth,
    async (req, res, next) => {
      const data = parse(answerSchema, req, res);
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
        const latest = (
          await client.query(
            `SELECT payload FROM game_play_moves
             WHERE play_id=$1 AND move_type='answer' ORDER BY move_number DESC LIMIT 1`,
            [play.play_id],
          )
        ).rows[0];
        if (
          latest?.payload?.optionId === data.optionId &&
          latest.payload.response
        ) {
          await client.query('COMMIT');
          return res.json({
            data: { ...latest.payload.response, replayed: true },
          });
        }
        if (play.status !== 'in_progress') {
          await client.query('ROLLBACK');
          return error(
            res,
            409,
            'GAME_FINISHED',
            'This Timer Trivia play has finished.',
            requestId(req),
          );
        }
        const state = await rebuildState(client, play);
        const pending = currentQuestion(state);
        if (!pending) {
          await client.query('ROLLBACK');
          return error(
            res,
            409,
            'NO_PENDING_QUESTION',
            'Choose a board cell first.',
            requestId(req),
          );
        }
        const selected = (
          await client.query(
            `SELECT o.option_id,o.is_correct,q.explanation
             FROM question_options o JOIN questions q ON q.question_id=o.question_id
             WHERE o.option_id=$1 AND o.question_id=$2`,
            [data.optionId, pending.question_id],
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
            [pending.question_id],
          )
        ).rows[0];
        const nextState = validateGameState(
          'timer_trivia',
          applyAnswer(state, selected.is_correct, new Date()),
        );
        const baseResponse = await responseForState(client, play, nextState);
        const response = {
          isCorrect: nextState.lastResult.isCorrect,
          timedOut: nextState.lastResult.timedOut,
          correctOption: {
            optionId: correctOption.option_id,
            optionText: correctOption.option_text,
          },
          explanation:
            selected.explanation ||
            `The correct answer is ${correctOption.option_text}.`,
          pointsEarned: nextState.lastResult.pointsDelta,
          ...baseResponse,
        };
        await appendMove(
          client,
          play,
          'answer',
          { optionId: data.optionId, response },
          nextState,
          pending.question_id,
          data.optionId,
        );
        await client.query(
          `UPDATE game_plays SET state=$1::jsonb,score=$2,status=$3,completed_at=$4
           WHERE play_id=$5`,
          [
            JSON.stringify(nextState),
            nextState.score,
            nextState.status,
            nextState.status === 'finished' ? new Date().toISOString() : null,
            play.play_id,
          ],
        );
        if (nextState.status === 'finished')
          await client.query(
            `INSERT INTO game_personal_bests(game_type_id,student_id,quiz_id,score)
             VALUES($1,$2,$3,$4)
             ON CONFLICT(game_type_id,student_id,quiz_id) DO UPDATE
             SET score=greatest(game_personal_bests.score,excluded.score),achieved_at=now()`,
            [play.game_type_id, play.student_id, play.quiz_id, nextState.score],
          );
        await client.query('COMMIT');
        res.json({ data: { ...response, replayed: false } });
      } catch (caught) {
        await client.query('ROLLBACK').catch(() => {});
        next(caught);
      } finally {
        client.release();
      }
    },
  );
}
