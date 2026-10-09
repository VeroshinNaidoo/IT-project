// @ts-nocheck - Express route metadata is runtime-specific.
// Every API route must have an explicit entry. This is intentionally data-only so
// authorization policy can be reviewed without reading handler implementation.
export const authorizationMatrix = {
  'GET /health': { auth: 'public' },
  'POST /api/v1/auth/register': { auth: 'public' },
  'POST /api/v1/auth/login': { auth: 'public' },
  'POST /api/v1/auth/logout': { auth: 'student|lecturer' },
  'GET /api/v1/auth/me': { auth: 'student|lecturer' },
  'GET /api/v1/modules': { auth: 'student|lecturer' },
  'POST /api/v1/modules': { auth: 'lecturer' },
  'POST /api/v1/enrollments': { auth: 'student' },
  'POST /api/v1/modules/:moduleId/groups': { auth: 'student|lecturer' },
  'POST /api/v1/groups/:groupId/join': { auth: 'student' },
  'GET /api/v1/modules/:moduleId/resources': { auth: 'student|lecturer' },
  'POST /api/v1/modules/:moduleId/resources': { auth: 'lecturer' },
  'POST /api/v1/quizzes': { auth: 'lecturer' },
  'POST /api/v1/resources/:resourceId/generation-jobs': { auth: 'lecturer' },
  'GET /api/v1/ai-generation-jobs/:jobId': { auth: 'student|lecturer' },
  'POST /api/v1/quizzes/:quizId/attempts': { auth: 'student' },
  'GET /api/v1/quizzes/:quizId/games': { auth: 'student|lecturer' },
  'POST /api/v1/attempts/:attemptId/submit': { auth: 'student' },
  'GET /api/v1/modules/:moduleId/leaderboard': { auth: 'student|lecturer' },
  'GET /api/v1/me/analytics': { auth: 'student' },
  'GET /api/v1/modules/:moduleId/groups/:groupId/analytics': {
    auth: 'lecturer',
  },
  'GET /api/v1/modules/:moduleId/analytics': { auth: 'lecturer' },
};

export const matrixKey = (method, path) => `${method.toUpperCase()} ${path}`;
