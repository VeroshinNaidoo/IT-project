import { defineConfig } from 'vitest/config';

const databaseTests = [
  'backend/tests/ai-worker.test.js',
  'backend/tests/api.test.js',
  'backend/tests/authorization-matrix.test.js',
  'backend/tests/database.invariants.test.js',
  'backend/tests/infected-api.test.js',
  'backend/tests/island-escape-api.test.js',
  'backend/tests/memory-match-api.test.js',
  'backend/tests/boss-battle-api.test.js',
];

export default defineConfig({
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'frontend/e2e/**',
      ...databaseTests,
    ],
    reporters: ['default', './scripts/no-skipped-tests-reporter.mjs'],
    sequence: {
      shuffle: {
        files: process.env.TEST_SHUFFLE === 'true',
        tests: false,
      },
      seed: Number(process.env.TEST_SEQUENCE_SEED ?? 1),
    },
  },
});
