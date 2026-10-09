import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers,
} from 'obscenity';
import { z } from 'zod';

const directory = path.dirname(fileURLToPath(import.meta.url));
/** @type {string[]} */
const customTerms = JSON.parse(
  readFileSync(path.join(directory, 'custom-terms.json'), 'utf8'),
);
/** @type {string[]} */
const allowedTerms = JSON.parse(
  readFileSync(path.join(directory, 'allowed-terms.json'), 'utf8'),
);
const customSet = new Set(customTerms.map((term) => normaliseToken(term)));
const allowedSet = new Set(allowedTerms.map((term) => normaliseToken(term)));
const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});
const genericMessage =
  "That text isn't allowed. Please choose different wording.";

/** @param {string} value */
function normaliseBase(value) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replaceAll('4', 'a')
    .replaceAll('@', 'a')
    .replaceAll('0', 'o')
    .replaceAll('$', 's')
    .replaceAll('1', 'i')
    .replaceAll('!', 'i')
    .replaceAll('3', 'e')
    .replaceAll('5', 's')
    .replaceAll('7', 't');
}

/** @param {string} value */
function normaliseToken(value) {
  return normaliseBase(value).replace(/[^a-z0-9]/g, '');
}

/** @param {string} value */
function collapseRepeatedLetters(value) {
  return value.replace(/(.)\1{1,}/g, '$1');
}

/** @param {string} token */
function hasCustomMatch(token) {
  const normalised = normaliseToken(token);
  return (
    customSet.has(normalised) ||
    customSet.has(collapseRepeatedLetters(normalised))
  );
}

/** @param {string} token */
function isAllowed(token) {
  return allowedSet.has(normaliseToken(token));
}

/** @param {string} text */
export function containsProfanity(text) {
  if (typeof text !== 'string' || text.length === 0) return false;
  const rawTokens = text.split(/[^\p{L}\p{N}@!$]+/u).filter(Boolean);
  for (const rawToken of rawTokens) {
    if (isAllowed(rawToken)) continue;
    const normalised = normaliseToken(rawToken);
    const collapsed = collapseRepeatedLetters(normalised);
    if (
      hasCustomMatch(rawToken) ||
      matcher.hasMatch(rawToken) ||
      matcher.hasMatch(normalised) ||
      matcher.hasMatch(collapsed)
    )
      return true;
  }
  const compact = normaliseToken(text);
  return (
    compact.length > 1 &&
    !allowedSet.has(compact) &&
    (hasCustomMatch(compact) ||
      matcher.hasMatch(compact) ||
      matcher.hasMatch(collapseRepeatedLetters(compact)))
  );
}

export function noProfanity() {
  /** @param {unknown} value */
  return (value) => typeof value === 'string' && !containsProfanity(value);
}

export const profanityMessage = genericMessage;
export const profanitySchema = z
  .string()
  .refine(noProfanity(), { message: genericMessage });
export const profanityLists = { customTerms, allowedTerms };
export { normaliseBase, normaliseToken };
