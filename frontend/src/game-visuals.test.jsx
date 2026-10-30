// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BossBattleGame,
  InfectedGame,
  IslandEscapeGame,
  MemoryMatchGame,
  PixelRacerGame,
  TimerTriviaGame,
} from './main.jsx';

const response = (body) => ({
  ok: true,
  status: 200,
  json: async () => body,
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('independent game visual assertions', () => {
  it('renders the Infected status bar, cure meter, character and card rewards', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          session: { cure: 40, hearts: 2, score: 20, status: 'in_progress' },
          cards: [
            {
              cardId: 'i-1',
              difficulty: 'easy',
              topic: 'Keys',
              reward: 10,
              penalty: 5,
            },
            {
              cardId: 'i-2',
              difficulty: 'medium',
              topic: 'SQL',
              reward: 20,
              penalty: 10,
            },
            {
              cardId: 'i-3',
              difficulty: 'hard',
              topic: 'Indexes',
              reward: 30,
              penalty: 15,
            },
          ],
        }),
      ),
    );
    render(<InfectedGame quizId="quiz" onBack={() => {}} />);
    expect(
      await screen.findByRole('heading', { name: 'INFECTED' }),
    ).toBeTruthy();
    expect(screen.getByLabelText('2 of 3 hearts')).toBeTruthy();
    expect(screen.getByText('Cure 40% · Infection 60%')).toBeTruthy();
    expect(
      screen.getByRole('img', { name: 'Character health state 3 of 5' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /hard card about Indexes/ }),
    ).toBeTruthy();
    expect(screen.getByText('+30 / −15')).toBeTruthy();
  });

  it('renders Island Escape phases, scene, inventory and question panel', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          play: {
            phase: 2,
            phaseName: 'Build the boat',
            phaseQuestionNumber: 3,
            wrongInPhase: 2,
            streak: 3,
            retriesRemaining: 2,
            score: 50,
            materials: ['Wood'],
            boatParts: ['Keel'],
            sailProgress: 0,
            doubleActive: true,
            status: 'in_progress',
          },
          question: {
            questionText: 'Which part supports the sail?',
            difficulty: 'medium',
            difficultyLevel: 3,
            topic: 'Boats',
            options: [
              { optionId: 'a', optionText: 'Mast' },
              { optionId: 'b', optionText: 'Anchor' },
              { optionId: 'c', optionText: 'Rope' },
              { optionId: 'd', optionText: 'Oar' },
            ],
          },
          personalBest: 50,
        }),
      ),
    );
    render(<IslandEscapeGame quizId="quiz" onBack={() => {}} />);
    expect(
      await screen.findByRole('heading', { name: 'Island Escape' }),
    ).toBeTruthy();
    expect(screen.getByRole('img', { name: /Build the boat/ })).toBeTruthy();
    expect(screen.getByText('Phase 2 of 3 · Question 4 of 10')).toBeTruthy();
    expect(screen.getByText('Wrong answers 2 of 5')).toBeTruthy();
    expect(screen.getByText('DOUBLE POINTS ACTIVE')).toBeTruthy();
    expect(screen.getByText('Materials: Wood')).toBeTruthy();
    expect(screen.getByText('Boat parts: Keel')).toBeTruthy();
  });

  it('renders Memory Match card backs and text-only game statistics', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          data: {
            playId: 'memory-play',
            status: 'in_progress',
            score: 0,
            moves: 0,
            matchedPairs: 0,
            cards: [
              ...Array.from({ length: 6 }, (_, index) => ({
                cardId: `q-${index}`,
                kind: 'question',
                faceUp: false,
                matched: false,
              })),
              ...Array.from({ length: 6 }, (_, index) => ({
                cardId: `a-${index}`,
                kind: 'answer',
                faceUp: false,
                matched: false,
              })),
            ],
            revealed: [],
          },
        }),
      ),
    );
    render(<MemoryMatchGame quizId="quiz" onBack={() => {}} />);
    expect(
      await screen.findByRole('heading', { name: 'MEMORY MATCH' }),
    ).toBeTruthy();
    expect(screen.getByText('Score 0')).toBeTruthy();
    expect(screen.getByText('Moves 0')).toBeTruthy();
    expect(screen.getByText('Pairs found 0')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Flip question card 1' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Flip answer card 7' }),
    ).toBeTruthy();
  });

  it('renders Boss Battle damage art, textual HP bars and four-answer panel', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          data: {
            play: {
              bossHp: 75,
              playerHp: 80,
              score: 25,
              status: 'in_progress',
            },
            question: {
              difficulty: 'hard',
              difficultyLevel: 5,
              topic: 'Indexes',
              questionText: 'Which index supports ordered lookup?',
              options: [
                { optionId: '1', optionText: 'B-tree' },
                { optionId: '2', optionText: 'Colour wheel' },
                { optionId: '3', optionText: 'Page margin' },
                { optionId: '4', optionText: 'Font family' },
              ],
            },
            outcome: null,
          },
        }),
      ),
    );
    render(<BossBattleGame quizId="quiz" onBack={() => {}} />);
    expect(
      await screen.findByRole('heading', { name: 'BOSS BATTLE' }),
    ).toBeTruthy();
    expect(screen.getByText('Boss HP')).toBeTruthy();
    expect(screen.getByText('75%')).toBeTruthy();
    expect(screen.getByText('80%')).toBeTruthy();
    expect(
      screen.getByRole('img', { name: 'Boss condition: Bruised' }),
    ).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(4);
  });

  it('renders Pixel Car Racer track, Bot, speed, streak and nitro state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          data: {
            play: {
              speed: 2,
              streak: 1,
              points: 10,
              distance: 20,
              slotsUsed: 1,
              answersUsed: 1,
              nitroActive: false,
              status: 'in_progress',
              bot: { distance: 15, points: 0 },
            },
            question: {
              topic: 'Networks',
              questionText: 'Which protocol is reliable?',
              options: [
                { optionId: '1', optionText: 'TCP' },
                { optionId: '2', optionText: 'UDP' },
              ],
            },
            outcome: null,
          },
        }),
      ),
    );
    render(<PixelRacerGame quizId="quiz" onBack={() => {}} />);
    expect(
      await screen.findByRole('heading', { name: 'PIXEL CAR RACER' }),
    ).toBeTruthy();
    expect(screen.getByText('Bot')).toBeTruthy();
    expect(screen.getByText('Speed 2 of 5')).toBeTruthy();
    expect(screen.getByText('Streak 1')).toBeTruthy();
    expect(screen.getByText('Nitro inactive')).toBeTruthy();
    expect(screen.getByRole('img', { name: /Bot car at 15/ })).toBeTruthy();
  });

  it('renders Timer Trivia board columns, round and score without a question', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          data: {
            play: {
              playId: 'timer-play',
              status: 'in_progress',
              score: 0,
              roundsCompleted: 0,
              board: [
                {
                  cellId: 'cell-1',
                  topic: 'Databases',
                  points: 10,
                  disabled: false,
                },
                {
                  cellId: 'cell-2',
                  topic: 'Networks',
                  points: 50,
                  disabled: false,
                },
              ],
              deadlineAt: null,
              extendedTime: false,
            },
            question: null,
          },
        }),
      ),
    );
    render(<TimerTriviaGame quizId="quiz" onBack={() => {}} />);
    expect(
      await screen.findByRole('heading', { name: 'TIMER TRIVIA' }),
    ).toBeTruthy();
    expect(screen.getByText('Round 1 of 10')).toBeTruthy();
    expect(screen.getByText('Score 0')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Databases, 10 points' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Networks, 50 points' }),
    ).toBeTruthy();
    expect(screen.queryByText(/Correct answer/)).toBeNull();
  });
});
