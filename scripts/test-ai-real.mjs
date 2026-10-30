import 'dotenv/config';
import { spawnSync } from 'node:child_process';
const selected = process.env.AI_PROVIDER || 'mock';
if (selected === 'anthropic' && !process.env.ANTHROPIC_API_KEY)
  throw new Error('ANTHROPIC_API_KEY is required for AI_PROVIDER=anthropic');
if (selected === 'openai' && !process.env.OPENAI_API_KEY)
  throw new Error('OPENAI_API_KEY is required for AI_PROVIDER=openai');
if (selected === 'openai_compatible' && !process.env.AI_API_KEY)
  throw new Error('AI_API_KEY is required for AI_PROVIDER=openai_compatible');
if (selected === 'openai_compatible' && !process.env.AI_BASE_URL)
  throw new Error('AI_BASE_URL is required for AI_PROVIDER=openai_compatible');
if (selected !== 'mock' && !process.env.AI_MODEL)
  throw new Error('AI_MODEL is required for real AI verification');
console.log(`Provider: ${selected}`);
console.log(`Model: ${process.env.AI_MODEL || 'mock-default'}`);
console.log(
  'Real AI verification requires the provider fixture runner and is not enabled by default.',
);
console.log(
  `AI_MAX_REQUESTS_PER_RUN=${process.env.AI_MAX_REQUESTS_PER_RUN || '40'}`,
);
const result = spawnSync('python', ['-m', 'pytest', 'ai-service/tests', '-q'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, AI_REAL_TESTS: 'true' },
});
process.exitCode = result.status ?? 1;
