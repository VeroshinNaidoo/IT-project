// @ts-nocheck - Express route metadata is runtime-specific.
// Every API route must have an explicit entry. This is intentionally data-only so
// authorization policy can be reviewed without reading handler implementation.
const routePolicies = {
  'GET /health': { auth: 'public' },
  'POST /api/v1/auth/register': { auth: 'public' },
  'POST /api/v1/auth/login': { auth: 'public' },
  'GET /api/v1/auth/verify-email': { auth: 'public' },
  'POST /api/v1/auth/logout': { auth: 'student|lecturer' },
  'GET /api/v1/auth/me': { auth: 'student|lecturer' },
  'PUT /api/v1/auth/me': { auth: 'student|lecturer' },
  'GET /api/v1/modules': { auth: 'student|lecturer' },
  'POST /api/v1/modules': { auth: 'lecturer' },
  'POST /api/v1/enrollments': { auth: 'student' },
  'POST /api/v1/modules/:moduleId/groups': { auth: 'student|lecturer' },
  'POST /api/v1/groups/:groupId/join': { auth: 'student' },
  'GET /api/v1/modules/:moduleId/resources': { auth: 'student|lecturer' },
  'POST /api/v1/modules/:moduleId/resources': { auth: 'lecturer' },
  'POST /api/v1/quizzes': { auth: 'lecturer' },
  'GET /api/v1/modules/:moduleId/quizzes': { auth: 'student|lecturer' },
  'POST /api/v1/resources/:resourceId/generation-jobs': { auth: 'lecturer' },
  'GET /api/v1/ai-generation-jobs/:jobId': { auth: 'student|lecturer' },
  'GET /api/v1/quizzes/:quizId': { auth: 'lecturer' },
  'PUT /api/v1/quizzes/:quizId': { auth: 'lecturer' },
  'POST /api/v1/quizzes/:quizId/attempts': { auth: 'student' },
  'GET /api/v1/quizzes/:quizId/games': { auth: 'student|lecturer' },
  'GET /api/v1/games/catalogue': { auth: 'student|lecturer' },
  'GET /api/v1/games/availability/:quizId': { auth: 'student|lecturer' },
  'GET /api/v1/games/in-progress': { auth: 'student|lecturer' },
  'GET /api/v1/games/quiz-picker': { auth: 'student|lecturer' },
  'POST /api/v1/attempts/:attemptId/submit': { auth: 'student' },
  'GET /api/v1/modules/:moduleId/leaderboard': { auth: 'student|lecturer' },
  'GET /api/v1/me/analytics': { auth: 'student' },
  'GET /api/v1/modules/:moduleId/groups/:groupId/analytics': {
    auth: 'lecturer',
  },
  'GET /api/v1/modules/:moduleId/analytics': { auth: 'lecturer' },
  'POST /api/v1/games/infected/sessions': { auth: 'student|lecturer' },
  'POST /api/v1/games/infected/sessions/:id/choose': {
    auth: 'student|lecturer',
  },
  'POST /api/v1/games/infected/sessions/:id/answer': {
    auth: 'student|lecturer',
  },
  'GET /api/v1/games/infected/sessions/:id': {
    auth: 'student|lecturer',
  },
  'GET /api/v1/modules/:moduleId/games/infected/activity': {
    auth: 'lecturer',
  },
  'GET /api/v1/modules/:moduleId/games/activity': { auth: 'lecturer' },
  'POST /api/v1/games/island-escape/plays': {
    auth: 'student|lecturer',
  },
  'POST /api/v1/games/island-escape/plays/:id/answer': {
    auth: 'student|lecturer',
  },
  'GET /api/v1/games/island-escape/plays/:id': {
    auth: 'student|lecturer',
  },
  'POST /api/v1/games/memory-match/plays': { auth: 'student|lecturer' },
  'GET /api/v1/games/memory-match/plays/:id': { auth: 'student|lecturer' },
  'POST /api/v1/games/memory-match/plays/:id/flip': {
    auth: 'student|lecturer',
  },
  'POST /api/v1/games/boss-battle/plays': { auth: 'student|lecturer' },
  'GET /api/v1/games/boss-battle/plays/:id': {
    auth: 'student|lecturer',
  },
  'POST /api/v1/games/boss-battle/plays/:id/answer': {
    auth: 'student|lecturer',
  },
  'POST /api/v1/games/pixel-racer/plays': { auth: 'student|lecturer' },
  'GET /api/v1/games/pixel-racer/plays/:id': {
    auth: 'student|lecturer',
  },
  'POST /api/v1/games/pixel-racer/plays/:id/answer': {
    auth: 'student|lecturer',
  },
  'POST /api/v1/games/timer-trivia/plays': { auth: 'student|lecturer' },
  'GET /api/v1/games/timer-trivia/plays/:id': {
    auth: 'student|lecturer',
  },
  'POST /api/v1/games/timer-trivia/plays/:id/choose': {
    auth: 'student|lecturer',
  },
  'POST /api/v1/games/timer-trivia/plays/:id/answer': {
    auth: 'student|lecturer',
  },
};

const caseNames = [
  'unauthenticated',
  'wrongRole',
  'wrongOwner',
  'validation',
  'success',
];

// Each route carries the five required matrix dimensions. Public routes mark
// the auth/ownership dimensions as not applicable; protected routes must have
// a corresponding behavioral test entry in the route matrix suite.
export const authorizationMatrix = Object.fromEntries(
  Object.entries(routePolicies).map(([route, policy]) => [
    route,
    {
      ...policy,
      cases: Object.fromEntries(
        caseNames.map((name) => [
          name,
          (policy.auth === 'public' &&
            ['unauthenticated', 'wrongRole', 'wrongOwner'].includes(name)) ||
          (policy.auth === 'student|lecturer' && name === 'wrongRole')
            ? 'not_applicable'
            : 'required',
        ]),
      ),
    },
  ]),
);

export const matrixKey = (method, path) => `${method.toUpperCase()} ${path}`;
