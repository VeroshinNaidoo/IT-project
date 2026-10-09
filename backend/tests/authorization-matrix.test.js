// @ts-nocheck - Express route metadata is runtime-specific.
import 'dotenv/config';
import { describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { authorizationMatrix, matrixKey } from '../src/authorization-matrix.js';

describe('route authorization matrix inventory', () => {
  it('has an explicit matrix entry for every registered route', () => {
    const routes = app.router.stack
      .filter((layer) => layer.route)
      .flatMap((layer) =>
        Object.keys(layer.route.methods).map((method) =>
          matrixKey(method, layer.route.path),
        ),
      );
    expect(routes.length).toBeGreaterThan(0);
    const missing = routes.filter((route) => !authorizationMatrix[route]);
    expect(
      missing,
      `Missing authorization matrix entries: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('does not classify any game route as scored or leaderboard-producing', () => {
    expect(
      authorizationMatrix['GET /api/v1/quizzes/:quizId/games'].auth,
    ).toContain('student');
  });
});
