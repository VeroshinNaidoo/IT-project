// @ts-nocheck - runtime records are validated through Zod and SQL constraints.
import crypto from 'node:crypto';
import { z } from 'zod';
import { canAccessGame } from '../access.js';
import { validateGameState } from '../play-state.js';
import { tierOf } from '../difficulty.js';
import { BOSS_MIN_QUESTIONS } from './config.js';
import { applyAnswer, createGame, currentQuestion } from './engine.js';
import { BOSS_STATE_VERSION } from './state.js';

const startSchema = z.object({ quizId: z.string().uuid() }).strict();
const answerSchema = z.object({ optionId: z.string().uuid() }).strict();
const emptySchema = z.object({}).strict();

export function registerBossBattleRoutes({
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
        `SELECT q.question_id,q.difficulty_level
         FROM questions q
         WHERE q.quiz_id=$1
           AND q.question_type NOT IN ('short_answer','code')
           AND EXISTS (
             SELECT 1 FROM question_options correct
             WHERE correct.question_id=q.question_id AND correct.is_correct=true
           )
           AND (SELECT count(*) FROM question_options options
                WHERE options.question_id=q.question_id) >= 2
         ORDER BY q.question_id`,
        [quizId],
      )
    ).rows;

  const loadPlay = async (client, playId, actorId, lock = false) =>
    (
      await client.query(
        `SELECT p.* FROM game_plays p
         JOIN game_types gt ON gt.game_type_id=p.game_type_id
         WHERE p.play_id=$1 AND p.student_id=$2 AND gt.key='boss_battle'
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
    return validateGameState('boss_battle', latest?.state_after || play.state);
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
    if (!row) return null;
    const options = await client.query(
      `SELECT option_id,option_text FROM question_options
       WHERE question_id=$1 ORDER BY option_id`,
      [row.question_id],
    );
    return {
      questionId: row.question_id,
      questionText: row.question_text,
      difficultyLevel: row.difficulty_level,
      difficulty: tierOf(row.difficulty_level),
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
    bossHp: state.bossHp,
    playerHp: state.playerHp,
    score: state.score,
    status: state.status,
    questionsAnswered: state.questionIndex,
    questionsRemaining: Math.max(
      0,
      state.questions.length - state.questionIndex,
    ),
  });

  const responseForState = async (client, play, state) => ({
    play: publicPlay(play, state),
    question:
      state.status === 'in_progress'
        ? await questionPayload(client, currentQuestion(state))
        : null,
    outcome:
      state.status === 'in_progress'
        ? null
        : {
            status: state.status,
            bossHp: state.bossHp,
            playerHp: state.playerHp,
            score: state.score,
          },
  });

  app.post(
    '/api/v1/games/boss-battle/plays',
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
        if (questions.length < BOSS_MIN_QUESTIONS) {
          await client.query('ROLLBACK');
          return error(
            res,
            409,
            'NOT_ENOUGH_QUESTIONS',
            `Boss Battle needs at least ${BOSS_MIN_QUESTIONS} eligible questions.`,
            requestId(req),
          );
        }
        const type = (
          await client.query(
            `SELECT game_type_id,is_enabled FROM game_types
             WHERE key='boss_battle'`,
          )
        ).rows[0];
        if (!type?.is_enabled) {
          await client.query('ROLLBACK');
          return error(
            res,
            409,
            'GAME_DISABLED',
            'Boss Battle is not available yet.',
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
          const state = validateGameState('boss_battle', {
            ...createGame(questions, serverSeed),
            version: BOSS_STATE_VERSION,
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
        res.status(resumed ? 200 : 201).json({
          data: { ...response, resumed },
        });
      } catch (caught) {
        await client.query('ROLLBACK').catch(() => {});
        next(caught);
      } finally {
        client.release();
      }
    },
  );

  app.get(
    '/api/v1/games/boss-battle/plays/:id',
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
    '/api/v1/games/boss-battle/plays/:id/answer',
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
            `SELECT payload,state_after FROM game_play_moves
             WHERE play_id=$1 ORDER BY move_number DESC LIMIT 1`,
            [play.play_id],
          )
        ).rows[0];
        if (latest?.payload?.optionId === data.optionId) {
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
            'This Boss Battle play has finished.',
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
            'There is no pending question to answer.',
            requestId(req),
          );
        }
        const selected = (
          await client.query(
            `SELECT o.option_id,o.option_text,o.is_correct,q.explanation
             FROM question_options o
             JOIN questions q ON q.question_id=o.question_id
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
          'boss_battle',
          applyAnswer(state, selected.is_correct),
        );
        const damageDealt = state.bossHp - nextState.bossHp;
        const damageTaken = state.playerHp - nextState.playerHp;
        const nextResponse = await responseForState(client, play, nextState);
        const response = {
          isCorrect: selected.is_correct,
          correctOption: {
            optionId: correctOption.option_id,
            optionText: correctOption.option_text,
          },
          explanation:
            selected.explanation ||
            `The correct answer is ${correctOption.option_text}.`,
          damageDealt,
          damageTaken,
          ...nextResponse,
        };
        const moveNumber = Number(
          (
            await client.query(
              `SELECT count(*)::int+1 AS next FROM game_play_moves
               WHERE play_id=$1`,
              [play.play_id],
            )
          ).rows[0].next,
        );
        await client.query(
          `INSERT INTO game_play_moves(
             play_id,move_number,move_type,payload,state_after,
             question_id,option_id,phase_attempt
           ) VALUES($1,$2,'answer',$3::jsonb,$4::jsonb,$5,$6,1)`,
          [
            play.play_id,
            moveNumber,
            JSON.stringify({ optionId: data.optionId, response }),
            JSON.stringify(nextState),
            pending.question_id,
            data.optionId,
          ],
        );
        await client.query(
          `UPDATE game_plays
           SET state=$1::jsonb,score=$2,status=$3,completed_at=$4
           WHERE play_id=$5`,
          [
            JSON.stringify(nextState),
            nextState.score,
            nextState.status,
            nextState.status === 'in_progress'
              ? null
              : new Date().toISOString(),
            play.play_id,
          ],
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
