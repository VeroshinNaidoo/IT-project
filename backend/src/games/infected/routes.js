// @ts-nocheck - Express and pg records are validated at runtime with Zod and SQL constraints.
import { z } from 'zod';
import { canAccessGame } from '../access.js';
import { tierOf } from '../difficulty.js';
import { applyAnswer, rewardFor, selectCards } from './engine.js';

const emptySchema = z.object({}).strict();
const startSchema = z.object({ quizId: z.string().uuid() }).strict();
const chooseSchema = z.object({ cardId: z.string().uuid() }).strict();
const answerSchema = z.object({ optionId: z.string().uuid() }).strict();

export function registerInfectedRoutes({
  app,
  pool,
  requireAuth,
  requireRole,
  error,
  requestId,
}) {
  const minimumQuestions = Number(process.env.GAME_MIN_QUESTIONS || 6);
  const validation = (schema, req, res) => {
    const result = schema.safeParse(req.body || {});
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

  const sessionState = (row) => ({
    sessionId: row.session_id,
    quizId: row.quiz_id,
    gameId: row.game_id,
    mode: row.mode,
    cure: row.cure,
    infection: 100 - row.cure,
    hearts: row.hearts,
    score: row.score,
    status: row.status,
    completedAt: row.completed_at,
  });

  const loadSession = async (client, sessionId, actorId, lock = false) => {
    const result = await client.query(
      `SELECT s.*,g.quiz_id,q.module_id,q.title AS quiz_title
       FROM game_sessions s
       JOIN games g ON g.game_id=s.game_id
       JOIN quizzes q ON q.quiz_id=g.quiz_id
       WHERE s.session_id=$1 AND s.student_id=$2${lock ? ' FOR UPDATE' : ''}`,
      [sessionId, actorId],
    );
    return result.rows[0] || null;
  };

  const currentTurn = async (client, sessionId) => {
    const result = await client.query(
      `SELECT * FROM game_turns WHERE session_id=$1
       ORDER BY turn_number DESC LIMIT 1`,
      [sessionId],
    );
    return result.rows[0] || null;
  };

  const cardsForTurn = async (client, turnId) => {
    if (!turnId) return [];
    const result = await client.query(
      `SELECT c.question_id,c.card_index,c.difficulty_level,t.name AS topic
       FROM game_turn_cards c
       JOIN questions q ON q.question_id=c.question_id
       LEFT JOIN topics t ON t.topic_id=q.topic_id
       WHERE c.turn_id=$1 ORDER BY c.card_index`,
      [turnId],
    );
    return result.rows.map((card) => {
      const difficulty = tierOf(card.difficulty_level);
      const transition = rewardFor(card.difficulty_level);
      return {
        cardId: card.question_id,
        difficulty,
        difficultyLevel: card.difficulty_level,
        topic: card.topic || 'General',
        reward: transition.reward,
        penalty: transition.penalty,
      };
    });
  };

  const questionForTurn = async (client, turn) => {
    if (!turn?.chosen_question_id) return null;
    const question = (
      await client.query(
        `SELECT q.question_id,q.question_text,q.difficulty_level,t.name AS topic
         FROM questions q LEFT JOIN topics t ON t.topic_id=q.topic_id
         WHERE q.question_id=$1`,
        [turn.chosen_question_id],
      )
    ).rows[0];
    const options = await client.query(
      `SELECT option_id,option_text FROM question_options
       WHERE question_id=$1 ORDER BY option_id`,
      [turn.chosen_question_id],
    );
    return {
      questionId: question.question_id,
      questionText: question.question_text,
      difficulty: tierOf(question.difficulty_level),
      difficultyLevel: question.difficulty_level,
      topic: question.topic || 'General',
      options: options.rows.map((option) => ({
        optionId: option.option_id,
        optionText: option.option_text,
      })),
    };
  };

  const createTurn = async (client, session) => {
    const unused = await client.query(
      `SELECT q.question_id,q.difficulty_level,t.name AS topic
       FROM questions q LEFT JOIN topics t ON t.topic_id=q.topic_id
       WHERE q.quiz_id=$1 AND q.question_type NOT IN ('short_answer','code') AND NOT EXISTS (
         SELECT 1 FROM game_turn_cards c
         WHERE c.session_id=$2 AND c.question_id=q.question_id
       ) ORDER BY q.question_id`,
      [session.quiz_id, session.session_id],
    );
    const selected = selectCards(unused.rows);
    if (!selected.length) {
      const finished = await client.query(
        `UPDATE game_sessions SET status='exhausted',completed_at=now()
         WHERE session_id=$1 RETURNING *`,
        [session.session_id],
      );
      Object.assign(session, finished.rows[0]);
      return null;
    }
    const turnNumber = Number(
      (
        await client.query(
          'SELECT count(*)::int + 1 AS next FROM game_turns WHERE session_id=$1',
          [session.session_id],
        )
      ).rows[0].next,
    );
    const turn = (
      await client.query(
        `INSERT INTO game_turns(session_id,turn_number,cure_before,hearts_before)
         VALUES($1,$2,$3,$4) RETURNING *`,
        [session.session_id, turnNumber, session.cure, session.hearts],
      )
    ).rows[0];
    for (const [index, question] of selected.entries())
      await client.query(
        `INSERT INTO game_turn_cards(turn_id,session_id,card_index,question_id,difficulty_level)
         VALUES($1,$2,$3,$4,$5)`,
        [
          turn.turn_id,
          session.session_id,
          index,
          question.question_id,
          question.difficulty_level,
        ],
      );
    return turn;
  };

  const payloadForSession = async (client, session) => {
    const turn = await currentTurn(client, session.session_id);
    const payload = { session: sessionState(session), cards: [] };
    if (!turn || session.status !== 'in_progress') return payload;
    payload.turnId = turn.turn_id;
    payload.cards = await cardsForTurn(client, turn.turn_id);
    if (turn.chosen_question_id && !turn.answered_at)
      payload.question = await questionForTurn(client, turn);
    return payload;
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
            `SELECT 1 FROM quiz_attempts WHERE quiz_id=$1 AND student_id=$2
             AND is_scored=true AND completion_time IS NOT NULL`,
            [quizId, req.user.userId],
          )
        ).rowCount,
      );
    } else if (quiz.lecturer_id !== req.user.userId) {
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
    '/api/v1/games/infected/sessions',
    requireAuth,
    async (req, res, next) => {
      const data = validation(startSchema, req, res);
      if (!data) return;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const quiz = await authorizeQuiz(client, req, res, data.quizId);
        if (!quiz) {
          await client.query('ROLLBACK');
          return;
        }
        const questionCount = Number(
          (
            await client.query(
              'SELECT count(*)::int AS count FROM questions WHERE quiz_id=$1',
              [data.quizId],
            )
          ).rows[0].count,
        );
        if (questionCount < minimumQuestions) {
          await client.query('ROLLBACK');
          return error(
            res,
            409,
            'GAME_NOT_ENOUGH_QUESTIONS',
            `Not enough questions for this game yet. At least ${minimumQuestions} are required.`,
            requestId(req),
          );
        }
        const game = (
          await client.query(
            `SELECT g.game_id FROM games g JOIN game_types gt ON gt.game_type_id=g.game_type_id
             WHERE g.quiz_id=$1 AND gt.key='infected' AND gt.is_enabled=true`,
            [data.quizId],
          )
        ).rows[0];
        if (!game) {
          await client.query('ROLLBACK');
          return error(
            res,
            409,
            'GAME_DISABLED',
            'This game is not currently available.',
            requestId(req),
          );
        }
        let session = (
          await client.query(
            `SELECT s.*,g.quiz_id FROM game_sessions s JOIN games g ON g.game_id=s.game_id
             WHERE s.game_id=$1 AND s.student_id=$2 AND s.mode='solo' AND s.status='in_progress'
             FOR UPDATE`,
            [game.game_id, req.user.userId],
          )
        ).rows[0];
        const resumed = Boolean(session);
        if (!session) {
          session = (
            await client.query(
              `INSERT INTO game_sessions(game_id,student_id,mode)
               VALUES($1,$2,'solo') RETURNING *`,
              [game.game_id, req.user.userId],
            )
          ).rows[0];
          session.quiz_id = data.quizId;
          await createTurn(client, session);
        }
        const payload = await payloadForSession(client, session);
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

  app.post(
    '/api/v1/games/infected/sessions/:id/choose',
    requireAuth,
    async (req, res, next) => {
      const data = validation(chooseSchema, req, res);
      if (!data) return;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const session = await loadSession(
          client,
          req.params.id,
          req.user.userId,
          true,
        );
        if (!session) {
          await client.query('ROLLBACK');
          return error(
            res,
            404,
            'NOT_FOUND',
            'Game session not found.',
            requestId(req),
          );
        }
        if (session.status !== 'in_progress') {
          await client.query('ROLLBACK');
          return error(
            res,
            409,
            'GAME_FINISHED',
            'This game session has finished.',
            requestId(req),
          );
        }
        const turn = await currentTurn(client, session.session_id);
        if (
          turn.chosen_question_id &&
          turn.chosen_question_id !== data.cardId
        ) {
          await client.query('ROLLBACK');
          return error(
            res,
            409,
            'CARD_ALREADY_CHOSEN',
            'A different card has already been chosen for this turn.',
            requestId(req),
          );
        }
        const card = await client.query(
          'SELECT 1 FROM game_turn_cards WHERE turn_id=$1 AND question_id=$2',
          [turn.turn_id, data.cardId],
        );
        if (!card.rowCount) {
          await client.query('ROLLBACK');
          return error(
            res,
            409,
            'INVALID_CARD',
            'That card is not available for this turn.',
            requestId(req),
          );
        }
        if (!turn.chosen_question_id)
          await client.query(
            'UPDATE game_turns SET chosen_question_id=$1 WHERE turn_id=$2',
            [data.cardId, turn.turn_id],
          );
        turn.chosen_question_id = data.cardId;
        const question = await questionForTurn(client, turn);
        await client.query('COMMIT');
        res.json({ session: sessionState(session), question });
      } catch (caught) {
        await client.query('ROLLBACK').catch(() => {});
        next(caught);
      } finally {
        client.release();
      }
    },
  );

  const answerPayload = async (client, session, turn) => {
    const answer = (
      await client.query(
        `SELECT chosen.is_correct,correct.option_id AS correct_option_id,
                correct.option_text AS correct_option_text,q.explanation
         FROM game_turns t
         JOIN question_options chosen ON chosen.option_id=t.chosen_option_id
         JOIN questions q ON q.question_id=t.chosen_question_id
         JOIN question_options correct ON correct.question_id=q.question_id AND correct.is_correct=true
         WHERE t.turn_id=$1`,
        [turn.turn_id],
      )
    ).rows[0];
    const latest = await currentTurn(client, session.session_id);
    const cards =
      session.status === 'in_progress' && latest?.answered_at === null
        ? await cardsForTurn(client, latest.turn_id)
        : [];
    return {
      isCorrect: answer.is_correct,
      correctOption: {
        optionId: answer.correct_option_id,
        optionText: answer.correct_option_text,
      },
      explanation:
        answer.explanation ||
        `The correct answer is ${answer.correct_option_text}`,
      session: sessionState(session),
      cards,
    };
  };

  app.post(
    '/api/v1/games/infected/sessions/:id/answer',
    requireAuth,
    async (req, res, next) => {
      const data = validation(answerSchema, req, res);
      if (!data) return;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        let session = await loadSession(
          client,
          req.params.id,
          req.user.userId,
          true,
        );
        if (!session) {
          await client.query('ROLLBACK');
          return error(
            res,
            404,
            'NOT_FOUND',
            'Game session not found.',
            requestId(req),
          );
        }
        let turn = await currentTurn(client, session.session_id);
        if (!turn?.chosen_question_id) {
          const prior = (
            await client.query(
              `SELECT * FROM game_turns WHERE session_id=$1 AND chosen_option_id=$2
               AND answered_at IS NOT NULL ORDER BY turn_number DESC LIMIT 1`,
              [session.session_id, data.optionId],
            )
          ).rows[0];
          if (prior) {
            const replay = await answerPayload(client, session, prior);
            await client.query('COMMIT');
            return res.json({ ...replay, replayed: true });
          }
        }
        if (turn?.answered_at) {
          if (turn.chosen_option_id !== data.optionId) {
            await client.query('ROLLBACK');
            return error(
              res,
              409,
              'GAME_FINISHED',
              'This answer has already been submitted.',
              requestId(req),
            );
          }
          const replay = await answerPayload(client, session, turn);
          await client.query('COMMIT');
          return res.json({ ...replay, replayed: true });
        }
        if (!turn?.chosen_question_id) {
          await client.query('ROLLBACK');
          return error(
            res,
            409,
            'CARD_REQUIRED',
            'Choose a card before answering.',
            requestId(req),
          );
        }
        const selected = (
          await client.query(
            `SELECT o.option_id,o.is_correct,q.difficulty_level
             FROM question_options o JOIN questions q ON q.question_id=o.question_id
             WHERE o.option_id=$1 AND o.question_id=$2`,
            [data.optionId, turn.chosen_question_id],
          )
        ).rows[0];
        if (!selected) {
          await client.query('ROLLBACK');
          return error(
            res,
            409,
            'INVALID_OPTION',
            'That option does not belong to this question.',
            requestId(req),
          );
        }
        const nextState = applyAnswer(
          sessionState(session),
          selected.difficulty_level,
          selected.is_correct,
        );
        const scoreDelta = nextState.score - session.score;
        turn = (
          await client.query(
            `UPDATE game_turns SET chosen_option_id=$1,is_correct=$2,cure_after=$3,
                    hearts_after=$4,score_delta=$5,answered_at=now()
             WHERE turn_id=$6 AND answered_at IS NULL RETURNING *`,
            [
              data.optionId,
              selected.is_correct,
              nextState.cure,
              nextState.hearts,
              scoreDelta,
              turn.turn_id,
            ],
          )
        ).rows[0];
        const completedAt =
          nextState.status === 'in_progress' ? null : new Date().toISOString();
        session = (
          await client.query(
            `UPDATE game_sessions SET cure=$1,hearts=$2,score=$3,status=$4,completed_at=$5
             WHERE session_id=$6 RETURNING *`,
            [
              nextState.cure,
              nextState.hearts,
              nextState.score,
              nextState.status,
              completedAt,
              session.session_id,
            ],
          )
        ).rows[0];
        session.quiz_id =
          session.quiz_id ||
          (await loadSession(client, session.session_id, req.user.userId))
            .quiz_id;
        if (session.status === 'in_progress') await createTurn(client, session);
        const payload = await answerPayload(client, session, turn);
        await client.query('COMMIT');
        res.json({ ...payload, replayed: false });
      } catch (caught) {
        await client.query('ROLLBACK').catch(() => {});
        next(caught);
      } finally {
        client.release();
      }
    },
  );

  app.get(
    '/api/v1/games/infected/sessions/:id',
    requireAuth,
    async (req, res, next) => {
      try {
        if (!validation(emptySchema, req, res)) return;
        const session = await loadSession(pool, req.params.id, req.user.userId);
        if (!session)
          return error(
            res,
            404,
            'NOT_FOUND',
            'Game session not found.',
            requestId(req),
          );
        res.json(await payloadForSession(pool, session));
      } catch (caught) {
        next(caught);
      }
    },
  );

  app.get(
    '/api/v1/modules/:moduleId/games/infected/activity',
    requireAuth,
    requireRole('lecturer'),
    async (req, res, next) => {
      try {
        if (!validation(emptySchema, req, res)) return;
        const owned = await pool.query(
          'SELECT 1 FROM modules WHERE module_id=$1 AND lecturer_id=$2',
          [req.params.moduleId, req.user.userId],
        );
        if (!owned.rowCount)
          return error(
            res,
            403,
            'FORBIDDEN',
            'You do not manage this module.',
            requestId(req),
          );
        const activity = await pool.query(
          `SELECT s.status,count(*)::int AS sessions,
                  round(avg(s.cure),2) AS average_cure,
                  round(avg(s.score),2) AS average_score
           FROM game_sessions s JOIN games g ON g.game_id=s.game_id
           JOIN quizzes q ON q.quiz_id=g.quiz_id
           WHERE q.module_id=$1 GROUP BY s.status ORDER BY s.status`,
          [req.params.moduleId],
        );
        res.json({ data: activity.rows });
      } catch (caught) {
        next(caught);
      }
    },
  );
}
