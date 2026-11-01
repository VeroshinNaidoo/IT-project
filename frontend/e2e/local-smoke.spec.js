import { test, expect } from '@playwright/test';

test('browser suite uses an isolated database, never the dev database', () => {
  expect(process.env.DATABASE_URL).not.toContain(':5432/eduquest');
  expect(process.env.DATABASE_URL).toContain(':55434/eduquest_e2e');
});

test('seeded lecturer logs in, generates a quiz and publishes it', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Email').fill('demo-lecturer@example.com');
  await page.getByLabel('Password').fill('EduQuestDemo123!');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
  await page.getByRole('button', { name: 'Resources', exact: true }).click();
  const selector = page.locator('article > select');
  await expect(selector.locator('option')).not.toHaveCount(1);
  await selector.selectOption({ label: 'Database Systems' });
  const resource = page.locator('.resource-generation').first();
  await resource.getByLabel('Questions').fill('3');
  await resource.getByRole('button', { name: 'Generate quiz' }).click();
  await expect(resource.getByText('Generated draft')).toBeVisible({
    timeout: 20000,
  });
  await resource
    .getByLabel('Quiz title')
    .fill(`Browser smoke ${test.info().project.name}`);
  const published = page.waitForResponse(
    (response) =>
      response.request().method() === 'PUT' &&
      response.url().includes('/api/v1/quizzes/'),
  );
  await resource.getByRole('button', { name: 'Publish quiz' }).click();
  expect((await published).status()).toBe(200);
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(
    page.getByRole('heading', { name: 'Welcome back' }),
  ).toBeVisible();
});
