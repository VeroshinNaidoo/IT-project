import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('authentication screen is usable at the required viewport', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Welcome back' }),
  ).toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('Infected solo flow is responsive, keyboard operable and axe clean', async ({
  page,
}) => {
  let phase = 'cards';
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let body;
    if (path.endsWith('/auth/me'))
      body = {
        user: {
          userId: 'student-1',
          role: 'student',
          full_name: 'Demo Student',
        },
      };
    else if (path.endsWith('/modules'))
      body = {
        data: [{ module_id: 'module-1', module_name: 'Database Systems' }],
      };
    else if (path.endsWith('/modules/module-1/quizzes'))
      body = {
        data: [
          {
            quiz_id: 'quiz-1',
            title: 'Demo practice quiz',
            is_competitive: false,
          },
        ],
      };
    else if (path.endsWith('/quizzes/quiz-1/games'))
      body = {
        data: [
          {
            game_id: 'game-1',
            key: 'infected',
            display_name: 'Infected',
            available: true,
          },
        ],
      };
    else if (path.endsWith('/games/infected/sessions'))
      body = {
        session: {
          sessionId: 'session-1',
          cure: 0,
          hearts: 3,
          score: 0,
          status: 'in_progress',
        },
        cards: [
          {
            cardId: 'card-1',
            difficulty: 'medium',
            topic: 'Normalization',
            reward: 20,
            penalty: 10,
          },
        ],
      };
    else if (path.endsWith('/choose')) {
      phase = 'question';
      body = {
        question: {
          questionId: 'card-1',
          questionText: 'Which normal form removes transitive dependencies?',
          difficulty: 'medium',
          options: [
            { optionId: 'option-1', optionText: 'Third normal form' },
            { optionId: 'option-2', optionText: 'First normal form' },
          ],
        },
      };
    } else if (path.endsWith('/answer')) {
      phase = 'feedback';
      body = {
        isCorrect: true,
        correctOption: {
          optionId: 'option-1',
          optionText: 'Third normal form',
        },
        explanation: 'Third normal form removes transitive dependencies.',
        session: {
          sessionId: 'session-1',
          cure: 20,
          hearts: 3,
          score: 20,
          status: 'in_progress',
        },
        cards: [],
      };
    } else body = { data: [] };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Quizzes' }).click();
  await page.getByRole('combobox').selectOption('module-1');
  await page.getByRole('button', { name: 'Play Infected' }).click();
  await expect(
    page.getByRole('heading', { name: 'INFECTED', exact: true }),
  ).toBeVisible();
  const card = page.getByRole('button', {
    name: /medium card about normalization/i,
  });
  await card.focus();
  await page.keyboard.press('Enter');
  expect(phase).toBe('question');
  await page.getByLabel('Third normal form').check();
  await page.getByRole('button', { name: 'Submit answer' }).click();
  expect(phase).toBe('feedback');
  await expect(page.getByText('Correct', { exact: true })).toBeVisible();
  await expect(page.getByText('Cure 20% · Infection 80%')).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('Island Escape flow is responsive, keyboard operable and axe clean', async ({
  page,
}) => {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let body;
    if (path.endsWith('/auth/me'))
      body = {
        user: {
          userId: 'student-1',
          role: 'student',
          full_name: 'Demo Student',
        },
      };
    else if (path.endsWith('/modules'))
      body = {
        data: [{ module_id: 'module-1', module_name: 'Database Systems' }],
      };
    else if (path.endsWith('/modules/module-1/quizzes'))
      body = {
        data: [
          {
            quiz_id: 'quiz-island',
            title: 'Island practice quiz',
            is_competitive: false,
          },
        ],
      };
    else if (path.endsWith('/quizzes/quiz-island/games'))
      body = {
        data: [
          {
            game_id: 'game-island',
            key: 'island_escape',
            display_name: 'Island Escape',
            available: true,
          },
        ],
      };
    else if (path.endsWith('/games/island-escape/plays'))
      body = {
        play: {
          playId: 'play-island',
          phase: 1,
          phaseName: 'Gather materials',
          phaseQuestionNumber: 0,
          wrongInPhase: 0,
          streak: 0,
          doubleActive: false,
          setbacks: 0,
          retriesRemaining: 3,
          score: 0,
          materials: [],
          boatParts: [],
          sailProgress: 0,
          status: 'in_progress',
        },
        question: {
          questionId: 'question-island',
          questionText: 'Which material makes a strong mast?',
          difficultyLevel: 1,
          difficulty: 'easy',
          topic: 'Materials',
          options: [
            { optionId: 'option-wood', optionText: 'Wood' },
            { optionId: 'option-paper', optionText: 'Paper' },
          ],
        },
      };
    else if (path.endsWith('/answer'))
      body = {
        isCorrect: true,
        correctOption: { optionId: 'option-wood', optionText: 'Wood' },
        explanation: 'Wood is rigid enough to support the sail.',
        pointsEarned: 10,
        event: 'answer',
        play: {
          playId: 'play-island',
          phase: 1,
          phaseName: 'Gather materials',
          phaseQuestionNumber: 1,
          wrongInPhase: 0,
          streak: 1,
          doubleActive: false,
          setbacks: 0,
          retriesRemaining: 3,
          score: 10,
          materials: ['Wood'],
          boatParts: [],
          sailProgress: 0,
          status: 'in_progress',
        },
        question: null,
      };
    else body = { data: [] };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Quizzes' }).click();
  await page.getByRole('combobox').selectOption('module-1');
  await page.getByRole('button', { name: 'Play Island Escape' }).click();
  await expect(
    page.getByRole('heading', { name: 'Island Escape', level: 2 }),
  ).toBeVisible();
  await expect(page.getByText('Phase 1 of 3 · Question 1 of 10')).toBeVisible();
  await expect(page.getByText(/Correct answer:/)).toHaveCount(0);
  await page.getByLabel('Wood').focus();
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: 'Submit answer' }).click();
  await expect(page.getByText('Correct', { exact: true })).toBeVisible();
  await expect(page.getByText(/Points earned: 10/)).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
