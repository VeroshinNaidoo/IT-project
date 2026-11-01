import { randomBytes, randomInt } from 'node:crypto';
import { appendFile, readFile } from 'node:fs/promises';
import path from 'node:path';

const envPath = path.resolve(process.env.ENV_FILE || '.env');
const alphabet =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function createToken(length = 48) {
  return Array.from(
    { length },
    () => alphabet[randomInt(alphabet.length)],
  ).join('');
}

const contents = await readFile(envPath, 'utf8').catch(() => '');
const existing = contents
  .match(/^AI_SERVICE_TOKEN\s*=\s*(\S.*)$/m)?.[1]
  ?.trim();

if (!existing) {
  const token = createToken();
  const prefix = contents.length > 0 && !contents.endsWith('\n') ? '\n' : '';
  await appendFile(envPath, `${prefix}AI_SERVICE_TOKEN=${token}\n`, 'utf8');
  console.log('AI_SERVICE_TOKEN=created');
} else {
  console.log('AI_SERVICE_TOKEN=present');
}

const refreshed = await readFile(envPath, 'utf8');
if (!/^MFA_ENCRYPTION_KEY\s*=\s*\S+/m.test(refreshed)) {
  await appendFile(
    envPath,
    `MFA_ENCRYPTION_KEY=${randomBytes(32).toString('hex')}\n`,
    'utf8',
  );
  console.log('MFA_ENCRYPTION_KEY=created');
} else {
  console.log('MFA_ENCRYPTION_KEY=present');
}
