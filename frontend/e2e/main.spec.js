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
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/choose')),
    page.keyboard.press('Enter'),
  ]);
  expect(phase).toBe('question');
  await page.getByLabel('Third normal form').check();
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/answer')),
    page.getByRole('button', { name: 'Submit answer' }).click(),
  ]);
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

test('Memory Match full flow, refresh and competitive lock are accessible', async ({
  page,
}) => {
  const sourceCards = Array.from({ length: 6 }, (_, pair) => [
    {
      cardId: `question-${pair}`,
      kind: 'question',
      pair,
      text: `Question ${pair + 1}`,
      faceUp: false,
      matched: false,
    },
    {
      cardId: `answer-${pair}`,
      kind: 'answer',
      pair,
      text: `Answer ${pair + 1}`,
      faceUp: false,
      matched: false,
    },
  ]).flat();
  let cards = sourceCards.map((card) => ({ ...card }));
  let mismatches = 0;
  let moves = 0;
  let status = 'in_progress';
  let lastMatched = null;

  const resetPlay = () => {
    cards = sourceCards.map((card) => ({ ...card }));
    mismatches = 0;
    moves = 0;
    status = 'in_progress';
    lastMatched = null;
  };
  const clientPlay = (flippedCard = null) => {
    const matchedPairs = cards.filter(
      (card) => card.kind === 'question' && card.matched,
    ).length;
    return {
      playId: 'memory-play',
      quizId: 'quiz-memory-practice',
      status,
      matchedPairs,
      mismatches,
      moves,
      score: Math.max(0, 10 * matchedPairs - mismatches),
      cards: cards.map(({ cardId, kind, faceUp, matched }) => ({
        cardId,
        kind,
        faceUp,
        matched,
      })),
      revealed: cards
        .filter((card) => card.faceUp || card.matched)
        .map(({ cardId, kind, text }) => ({ cardId, kind, text })),
      flippedCard,
      matched: lastMatched,
    };
  };

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let body;
    let statusCode = 200;
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
            quiz_id: 'quiz-memory-competitive',
            title: 'Locked competitive quiz',
            is_competitive: true,
          },
          {
            quiz_id: 'quiz-memory-practice',
            title: 'Memory practice quiz',
            is_competitive: false,
          },
        ],
      };
    else if (path.endsWith('/quizzes/quiz-memory-competitive/games'))
      body = {
        data: [
          {
            game_id: 'memory-game',
            key: 'memory_match',
            display_name: 'Memory Match',
            available: false,
            reason: 'Complete your scored attempt to unlock this game.',
          },
        ],
      };
    else if (path.endsWith('/quizzes/quiz-memory-practice/games'))
      body = {
        data: [
          {
            game_id: 'memory-game',
            key: 'memory_match',
            display_name: 'Memory Match',
            available: true,
          },
        ],
      };
    else if (
      path.endsWith('/games/memory-match/plays') &&
      request.method() === 'POST'
    ) {
      if (status === 'finished') resetPlay();
      body = { data: clientPlay() };
    } else if (path.endsWith('/games/memory-match/plays/memory-play/flip')) {
      const { cardId } = request.postDataJSON();
      const unresolved = cards.filter((card) => card.faceUp && !card.matched);
      if (unresolved.length === 2)
        for (const card of unresolved) card.faceUp = false;
      const card = cards.find((item) => item.cardId === cardId);
      if (!card || card.matched || card.faceUp) {
        statusCode = 409;
        body = {
          error: { code: 'CONFLICT', message: 'Card cannot be flipped.' },
        };
      } else {
        card.faceUp = true;
        const first = cards.find(
          (item) => item.cardId !== cardId && item.faceUp && !item.matched,
        );
        lastMatched = null;
        if (first) {
          moves += 1;
          lastMatched = first.pair === card.pair;
          if (lastMatched) {
            first.matched = true;
            card.matched = true;
          } else mismatches += 1;
        }
        if (cards.every((item) => item.matched)) status = 'finished';
        body = {
          data: clientPlay({
            cardId: card.cardId,
            kind: card.kind,
            text: card.text,
          }),
        };
      }
    } else body = { data: [] };
    await route.fulfill({
      status: statusCode,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });

  const openQuizzes = async () => {
    await page.getByRole('button', { name: 'Quizzes' }).click();
    await page.getByRole('combobox').selectOption('module-1');
  };
  const flip = async (name) => {
    const card = page.getByRole('button', { name, exact: true });
    await card.focus();
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response
            .url()
            .includes('/games/memory-match/plays/memory-play/flip') &&
          response.request().method() === 'POST',
      ),
      page.keyboard.press('Enter'),
    ]);
    await page.waitForTimeout(50);
  };

  await page.goto('/');
  await openQuizzes();
  const lockedQuiz = page
    .locator('.quiz-entry')
    .filter({ hasText: 'Locked competitive quiz' });
  await expect(
    lockedQuiz.getByText('Complete your scored attempt to unlock this game.'),
  ).toBeVisible();
  await expect(
    lockedQuiz.getByRole('button', { name: 'Play Memory Match' }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Play Memory Match' }).click();
  await expect(
    page.getByRole('heading', { name: 'MEMORY MATCH', exact: true, level: 2 }),
  ).toBeVisible();
  await expect(page.getByText('Question 1')).toHaveCount(0);
  await expect(page.getByText('Answer 1')).toHaveCount(0);

  await flip('Flip question card 1');
  await expect(page.getByText('Question 1')).toBeVisible();
  await page.reload();
  await openQuizzes();
  await page.getByRole('button', { name: 'Play Memory Match' }).click();
  await expect(page.getByText('Question 1')).toBeVisible();

  await flip('Flip answer card 4');
  await expect(page.getByText(/Not a match/)).toBeAttached();
  await expect(page.getByText('Question 1')).toHaveCount(0, { timeout: 2000 });
  await flip('Flip question card 1');
  await flip('Flip answer card 2');
  await expect(page.getByText(/Match found. 1 pairs found/)).toBeAttached();

  for (let pair = 1; pair < 6; pair += 1) {
    await flip(`Flip question card ${pair * 2 + 1}`);
    await flip(`Flip answer card ${pair * 2 + 2}`);
  }
  await expect(page.getByText('Every pair matched')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play again' })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('Boss Battle full flow and competitive lock are accessible', async ({
  page,
}) => {
  let bossHp = 100;
  let playerHp = 100;
  let score = 0;
  let answerCount = 0;
  const question = () => ({
    questionId: `boss-question-${answerCount + 1}`,
    questionText: 'Which database structure speeds up keyed lookups?',
    difficultyLevel: 5,
    difficulty: 'hard',
    topic: 'Indexes',
    options: [
      { optionId: 'boss-correct', optionText: 'A B-tree index' },
      { optionId: 'boss-wrong-1', optionText: 'A colour palette' },
      { optionId: 'boss-wrong-2', optionText: 'A page margin' },
      { optionId: 'boss-wrong-3', optionText: 'A font family' },
    ],
  });
  const play = () => ({
    playId: 'boss-play',
    quizId: 'quiz-boss-practice',
    bossHp,
    playerHp,
    score,
    status: bossHp === 0 ? 'won' : playerHp === 0 ? 'lost' : 'in_progress',
  });

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
            quiz_id: 'quiz-boss-competitive',
            title: 'Locked boss challenge',
            is_competitive: true,
          },
          {
            quiz_id: 'quiz-boss-practice',
            title: 'Boss practice quiz',
            is_competitive: false,
          },
        ],
      };
    else if (path.endsWith('/quizzes/quiz-boss-competitive/games'))
      body = {
        data: [
          {
            game_id: 'boss-game',
            key: 'boss_battle',
            display_name: 'Boss Battle',
            available: false,
            reason: 'Complete your scored attempt to unlock this game.',
          },
        ],
      };
    else if (path.endsWith('/quizzes/quiz-boss-practice/games'))
      body = {
        data: [
          {
            game_id: 'boss-game',
            key: 'boss_battle',
            display_name: 'Boss Battle',
            available: true,
          },
        ],
      };
    else if (
      path.endsWith('/games/boss-battle/plays') &&
      request.method() === 'POST'
    ) {
      if (bossHp === 0 || playerHp === 0) {
        bossHp = 100;
        playerHp = 100;
        score = 0;
        answerCount = 0;
      }
      body = {
        data: {
          play: play(),
          question: question(),
          outcome: null,
          resumed: false,
        },
      };
    } else if (path.endsWith('/games/boss-battle/plays/boss-play/answer')) {
      const { optionId } = request.postDataJSON();
      const isCorrect = optionId === 'boss-correct';
      answerCount += 1;
      if (isCorrect) {
        bossHp = Math.max(0, bossHp - 25);
        score += 25;
      } else playerHp = Math.max(0, playerHp - 20);
      body = {
        data: {
          isCorrect,
          correctOption: {
            optionId: 'boss-correct',
            optionText: 'A B-tree index',
          },
          explanation: 'A B-tree keeps keyed lookups efficient.',
          damageDealt: isCorrect ? 25 : 0,
          damageTaken: isCorrect ? 0 : 20,
          play: play(),
          question: bossHp === 0 ? null : question(),
          outcome: bossHp === 0 ? 'won' : null,
          replayed: false,
        },
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
  const lockedQuiz = page
    .locator('.quiz-entry')
    .filter({ hasText: 'Locked boss challenge' });
  await expect(
    lockedQuiz.getByText('Complete your scored attempt to unlock this game.'),
  ).toBeVisible();
  await expect(
    lockedQuiz.getByRole('button', { name: 'Play Boss Battle' }),
  ).toHaveCount(0);

  await page.getByRole('button', { name: 'Play Boss Battle' }).click();
  await expect(
    page.getByRole('heading', { name: 'BOSS BATTLE', exact: true, level: 2 }),
  ).toBeVisible();
  await expect(
    page.getByRole('progressbar', { name: 'Boss HP' }),
  ).toHaveAttribute('aria-valuenow', '100');
  await expect(page.getByText(/Correct answer:/)).toHaveCount(0);

  await page.getByLabel('A colour palette').focus();
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: 'Submit answer' }).click();
  await expect(page.getByText('Incorrect', { exact: true })).toBeVisible();
  await expect(page.getByText('Player damage: 20.')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(
    page.getByRole('progressbar', { name: 'Player HP' }),
  ).toHaveAttribute('aria-valuenow', '80');

  for (let round = 0; round < 4; round += 1) {
    await page.getByLabel('A B-tree index').check();
    await page.getByRole('button', { name: 'Submit answer' }).click();
    await expect(page.getByText('Correct', { exact: true })).toBeVisible();
    await expect(page.getByText('Boss damage: 25.')).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();
  }

  await expect(page.getByText('Boss defeated')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play again' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Back to quiz' }),
  ).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
