// @ts-nocheck - cryptographic helpers operate on runtime buffers.
import crypto from 'node:crypto';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const keyBytes = () => {
  const value = process.env.MFA_ENCRYPTION_KEY;
  if (!value)
    throw new Error('MFA_ENCRYPTION_KEY is missing: run npm run setup:token');
  const key = /^[0-9a-f]{64}$/i.test(value)
    ? Buffer.from(value, 'hex')
    : Buffer.from(value, 'base64');
  if (key.length !== 32)
    throw new Error('MFA_ENCRYPTION_KEY must decode to 32 bytes.');
  return key;
};

export const encryptSecret = (secret) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBytes(), iv);
  const encrypted = Buffer.concat([
    cipher.update(secret, 'utf8'),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), encrypted]
    .map((part) => part.toString('base64url'))
    .join('.');
};

export const decryptSecret = (value) => {
  const [iv, tag, encrypted] = value
    .split('.')
    .map((part) => Buffer.from(part, 'base64url'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBytes(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    'utf8',
  );
};

export const base32Encode = (input) => {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
  let bits = 0;
  let value = 0;
  let result = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) result += alphabet[(value << (5 - bits)) & 31];
  return result;
};

const base32Decode = (input) => {
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const character of input.replace(/=+$/, '').toUpperCase()) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error('Invalid base32 secret');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
};

export const totpAt = (secret, timestamp = Date.now()) => {
  const counter = Math.floor(timestamp / 1000 / 30);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = crypto
    .createHmac('sha1', base32Decode(secret))
    .update(message)
    .digest();
  const offset = digest[digest.length - 1] & 15;
  const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, '0');
};

export const codesMatch = (actual, expected) => {
  const a = Buffer.from(String(actual));
  const b = Buffer.from(String(expected));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

export const validTotp = (secret, code, timestamp = Date.now()) =>
  [-1, 0, 1].some((offset) =>
    codesMatch(code, totpAt(secret, timestamp + offset * 30_000)),
  );

export const hashSecret = (value) =>
  crypto.createHash('sha256').update(value).digest('hex');
export const randomRecoveryCode = () =>
  crypto.randomBytes(5).toString('hex').toUpperCase();
export const randomTotpSecret = () => base32Encode(crypto.randomBytes(20));
