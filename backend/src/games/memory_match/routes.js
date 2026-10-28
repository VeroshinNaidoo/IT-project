// @ts-nocheck
import crypto from 'node:crypto';
import { z } from 'zod';
import { canAccessGame } from '../access.js';
import { validateGameState } from '../play-state.js';
import { MEMORY_DEFAULT_PAIRS, MEMORY_MIN_PAIRS } from './config.js';
import './state.js';

const startSchema = z.object({ quizId: z.string().uuid() }).strict();
const emptySchema = z.object({}).strict();

export function registerMemoryMatchRoutes({
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
  const authorize = async (client, req, res, quizId) => {
    const quiz = (
      await client.query(
        `SELECT q.*,m.lecturer_id FROM quizzes q JOIN modules m ON m.module_id=q.module_id WHERE q.quiz_id=$1`,
        [quizId],
      )
    ).rows[0];
    if (!quiz) {
      error(res, 404, 'NOT_FOUND', 'Quiz not found.', requestId(req));
      return null;
    }
    let completed = false;
    if (req.user.role === 'student') {
      if (
        !(
          await client.query(
            'SELECT 1 FROM enrollments WHERE module_id=$1 AND student_id=$2',
            [quiz.module_id, req.user.userId],
          )
        ).rowCount
      ) {
        error(
          res,
          403,
          'FORBIDDEN',
          'You are not enrolled in this module.',
          requestId(req),
        );
        return null;
      }
      completed = Boolean(
        (
          await client.query(
            'SELECT 1 FROM quiz_attempts WHERE quiz_id=$1 AND student_id=$2 AND is_scored=true AND completion_time IS NOT NULL',
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
    if (!canAccessGame(req.user, quiz, { scoredAttemptCompleted: completed })) {
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
  const clientView = (play) => {
    const state = validateGameState('memory_match', play.state);
    return {
      playId: play.play_id,
      quizId: play.quiz_id,
      status: state.status,
      matchedPairs: state.matchedPairs,
      mismatches: state.mismatches,
      moves: state.moves,
      score: state.score,
      cards: state.cards.map(({ cardId, kind, faceUp, matched }) => ({
        cardId,
        kind,
        faceUp,
        matched,
      })),
      revealed: state.cards
        .filter((card) => card.faceUp || card.matched)
        .map(({ cardId, kind, text }) => ({ cardId, kind, text })),
    };
  };
  const makeState = (questions) => {
    const serverSeed = crypto.randomBytes(16).toString('hex');
    const cards = questions.flatMap((question) => {
      const pairKey = crypto.randomUUID();
      return [
        {
          cardId: crypto.randomUUID(),
          kind: 'question',
          questionId: question.question_id,
          pairKey,
          text: question.question_text,
          faceUp: false,
          matched: false,
        },
        {
          cardId: crypto.randomUUID(),
          kind: 'answer',
          questionId: question.question_id,
          pairKey,
          text: question.correct_option_text,
          faceUp: false,
          matched: false,
        },
      ];
    });
    for (let i = cards.length - 1; i > 0; i -= 1) {
      const j =
        Number.parseInt(
          crypto
            .createHash('sha256')
            .update(`${serverSeed}:${i}`)
            .digest('hex')
            .slice(0, 8),
          16,
        ) %
        (i + 1);
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    return validateGameState('memory_match', {
      version: 1,
      cards,
      matchedPairs: 0,
      mismatches: 0,
      moves: 0,
      score: 0,
      status: 'in_progress',
      serverSeed,
      startedAt: new Date().toISOString(),
    });
  };
  const eligibleQuestions = async (client, quizId) =>
    (
      await client.query(
        `SELECT q.question_id,q.question_text,o.option_text AS correct_option_text FROM questions q JOIN question_options o ON o.question_id=q.question_id AND o.is_correct=true WHERE q.quiz_id=$1 AND length(q.question_text)<=140 AND length(o.option_text)<=60 ORDER BY q.question_id LIMIT $2`,
        [quizId, MEMORY_DEFAULT_PAIRS],
      )
    ).rows;

  app.post(
    '/api/v1/games/memory-match/plays',
    requireAuth,
    async (req, res, next) => {
      const data = parse(startSchema, req, res);
      if (!data) return;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const quiz = await authorize(client, req, res, data.quizId);
        if (!quiz) return client.query('ROLLBACK');
        const count = (
          await client.query(
            `SELECT count(*)::int AS count FROM questions q JOIN question_options o ON o.question_id=q.question_id AND o.is_correct=true WHERE q.quiz_id=$1 AND length(q.question_text)<=140 AND length(o.option_text)<=60`,
            [data.quizId],
          )
        ).rows[0].count;
        if (count < MEMORY_MIN_PAIRS) {
          await client.query('ROLLBACK');
          return error(
            res,
            409,
            'NOT_ENOUGH_QUESTIONS',
            `Memory Match needs at least ${MEMORY_MIN_PAIRS} eligible questions.`,
            requestId(req),
          );
        }
        const type = (
          await client.query(
            "SELECT game_type_id,is_enabled FROM game_types WHERE key='memory_match'",
          )
        ).rows[0];
        if (!type?.is_enabled) {
          await client.query('ROLLBACK');
          return error(
            res,
            409,
            'GAME_DISABLED',
            'Memory Match is not available yet.',
            requestId(req),
          );
        }
        let play = (
          await client.query(
            `SELECT * FROM game_plays WHERE game_type_id=$1 AND student_id=$2 AND quiz_id=$3 AND mode='solo' AND status='in_progress' FOR UPDATE`,
            [type.game_type_id, req.user.userId, data.quizId],
          )
        ).rows[0];
        if (!play) {
          const state = makeState(await eligibleQuestions(client, data.quizId));
          play = (
            await client.query(
              `INSERT INTO game_plays(game_type_id,student_id,quiz_id,state,score) VALUES($1,$2,$3,$4::jsonb,0) RETURNING *`,
              [
                type.game_type_id,
                req.user.userId,
                data.quizId,
                JSON.stringify(state),
              ],
            )
          ).rows[0];
        }
        await client.query('COMMIT');
        res.status(200).json({ data: clientView(play) });
      } catch (caught) {
        await client.query('ROLLBACK').catch(() => {});
        next(caught);
      } finally {
        client.release();
      }
    },
  );

  app.get(
    '/api/v1/games/memory-match/plays/:id',
    requireAuth,
    async (req, res, next) => {
      try {
        if (!parse(emptySchema, req, res)) return;
        const play = (
          await pool.query(
            `SELECT p.* FROM game_plays p JOIN game_types gt ON gt.game_type_id=p.game_type_id WHERE p.play_id=$1 AND p.student_id=$2 AND gt.key='memory_match'`,
            [req.params.id, req.user.userId],
          )
        ).rows[0];
        if (!play)
          return error(
            res,
            404,
            'NOT_FOUND',
            'Game play not found.',
            requestId(req),
          );
        res.json({ data: clientView(play) });
      } catch (caught) {
        next(caught);
      }
    },
  );
}
