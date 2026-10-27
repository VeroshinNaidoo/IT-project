import 'dotenv/config';
if (!process.env.ANTHROPIC_API_KEY)
  throw new Error('ANTHROPIC_API_KEY is required for real AI verification');
console.log(
  'Real AI verification requires the provider fixture runner and is not enabled by default.',
);
console.log(
  `AI_MAX_REQUESTS_PER_RUN=${process.env.AI_MAX_REQUESTS_PER_RUN || '40'}`,
);
