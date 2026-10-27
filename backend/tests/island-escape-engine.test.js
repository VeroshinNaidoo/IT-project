// @ts-nocheck - property generators exercise runtime state validated by Zod.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  applyAnswer,
  initialIslandState,
  isTerminal,
  rebuildState,
  selectQuestions,
} from '../src/games/island_escape/engine.js';

const run = (answers, start = initialIslandState()) =>
  answers.reduce((state, answer) => applyAnswer(state, answer), start);

describe('Island Escape pure engine', () => {
  it('scores the fourth consecutive correct answer at double points', () => {
    const state = run([true, true, true, true]);
    expect(state.score).toBe(50);
    expect(state.streak).toBe(4);
    expect(state.doubleActive).toBe(true);
  });

  it('ends doubling immediately after a wrong answer', () => {
    const state = run([true, true, true, false, true]);
    expect(state.score).toBe(40);
    expect(state.streak).toBe(1);
    expect(state.doubleActive).toBe(false);
  });

  it('wins a perfect run with 570 points', () => {
    const state = run(Array.from({ length: 30 }, () => true));
    expect(state).toMatchObject({ status: 'won', score: 570, phase: 3 });
  });

  it('passes all phases with exactly four wrong answers in each', () => {
    let state = initialIslandState();
    for (let phase = 1; phase <= 3; phase += 1)
      state = run(
        [false, false, false, false, true, true, true, true, true, true],
        state,
      );
    expect(state.status).toBe('won');
    expect(state.setbacks).toBe(0);
  });

  it('restarts phase 1 immediately on its fifth wrong answer', () => {
    const state = run([true, true, true, false, false, false, false, false]);
    expect(state).toMatchObject({
      phase: 1,
      phaseQuestionNumber: 0,
      wrongInPhase: 0,
      streak: 0,
      setbacks: 1,
      lastEvent: 'tools_lost',
    });
    expect(state.materials).toEqual([]);
    expect(state.score).toBe(30);
  });

  it('restarts phase 2 and preserves phase 1 materials', () => {
    const start = {
      ...initialIslandState(),
      phase: 2,
      materials: ['Wood', 'Rope'],
      boatParts: ['Hull'],
    };
    const state = run(
      Array.from({ length: 5 }, () => false),
      start,
    );
    expect(state).toMatchObject({ phase: 2, lastEvent: 'boat_broken' });
    expect(state.materials).toEqual(['Wood', 'Rope']);
    expect(state.boatParts).toEqual([]);
  });

  it('returns a phase 3 setback to the beginning of phase 2', () => {
    const start = {
      ...initialIslandState(),
      phase: 3,
      materials: ['Wood'],
      boatParts: ['Hull'],
      sailProgress: 3,
    };
    const state = run(
      Array.from({ length: 5 }, () => false),
      start,
    );
    expect(state).toMatchObject({
      phase: 2,
      phaseQuestionNumber: 0,
      sailProgress: 0,
      lastEvent: 'sharks',
    });
    expect(state.materials).toEqual(['Wood']);
    expect(state.boatParts).toEqual([]);
  });

  it('ends the game as lost on the fourth setback', () => {
    const start = { ...initialIslandState(), setbacks: 3 };
    const state = run(
      Array.from({ length: 5 }, () => false),
      start,
    );
    expect(state).toMatchObject({
      setbacks: 4,
      status: 'lost',
      lastEvent: 'stranded',
    });
  });

  it('carries a live streak across a phase boundary', () => {
    const start = {
      ...initialIslandState(),
      phaseQuestionNumber: 8,
      streak: 2,
      materials: ['Wood'],
    };
    const state = run([true, true], start);
    expect(state).toMatchObject({
      phase: 2,
      phaseQuestionNumber: 0,
      streak: 4,
      doubleActive: true,
      lastEvent: 'phase_advanced',
    });
  });

  it('rejects every move after a terminal state', () => {
    for (const status of ['won', 'lost', 'exhausted']) {
      const state = { ...initialIslandState(), status };
      expect(isTerminal(state)).toBe(true);
      expect(() => applyAnswer(state, true)).toThrow('ISLAND_PLAY_FINISHED');
    }
  });

  it('prefers the configured level ramp and never duplicates a phase question', () => {
    const pool = Array.from({ length: 30 }, (_, index) => ({
      question_id: `q-${index}`,
      difficulty_level: (index % 5) + 1,
    }));
    for (const [phase, levels] of [
      [1, [1, 2]],
      [2, [3]],
      [3, [4, 5]],
    ]) {
      const selected = selectQuestions(
        pool,
        { ...initialIslandState(), phase },
        () => 0.5,
      );
      expect(selected).toHaveLength(10);
      expect(new Set(selected.map((item) => item.question_id)).size).toBe(10);
      expect(
        selected.filter((item) => levels.includes(item.difficulty_level))
          .length,
      ).toBeGreaterThan(0);
    }
  });

  it('uses unseen questions first, then recycles least recently asked', () => {
    const pool = Array.from({ length: 10 }, (_, index) => ({
      question_id: `q-${index}`,
      difficulty_level: 3,
    }));
    const selected = selectQuestions(
      pool,
      {
        ...initialIslandState(),
        phase: 2,
        askedQuestionIds: ['q-0', 'q-1', 'q-2'],
      },
      () => 0.5,
    );
    expect(selected.slice(0, 7).map((item) => item.question_id)).not.toContain(
      'q-0',
    );
    expect(new Set(selected.map((item) => item.question_id)).size).toBe(10);
  });

  it('rebuilds the same transition state from the move log', () => {
    const answers = [true, true, false, true, true, true, false];
    const state = run(answers);
    expect(rebuildState(answers.map((isCorrect) => ({ isCorrect })))).toEqual(
      state,
    );
  });

  it('preserves all state invariants for arbitrary answer sequences', () => {
    fc.assert(
      fc.property(fc.array(fc.boolean(), { maxLength: 200 }), (answers) => {
        let state = initialIslandState();
        let previousScore = 0;
        for (const answer of answers) {
          if (isTerminal(state)) {
            expect(() => applyAnswer(state, answer)).toThrow(
              'ISLAND_PLAY_FINISHED',
            );
            break;
          }
          state = applyAnswer(state, answer);
          expect(state.score).toBeGreaterThanOrEqual(previousScore);
          expect(state.wrongInPhase).toBeGreaterThanOrEqual(0);
          expect(state.wrongInPhase).toBeLessThan(5);
          expect(state.setbacks).toBeLessThanOrEqual(4);
          if (state.doubleActive)
            expect(state.streak).toBeGreaterThanOrEqual(3);
          previousScore = state.score;
        }
      }),
    );
  });
});
