// @ts-nocheck - game modules register concrete runtime Zod schemas.
import { z } from 'zod';

export const versionedGameStateSchema = z
  .object({ version: z.number().int().positive() })
  .passthrough();

const schemas = new Map();

export function registerGameStateSchema(key, schema) {
  if (!key || schemas.has(key)) throw new Error('GAME_STATE_SCHEMA_EXISTS');
  schemas.set(key, versionedGameStateSchema.and(schema));
}

export function validateGameState(key, state) {
  const schema = schemas.get(key);
  if (!schema) throw new Error('GAME_STATE_SCHEMA_NOT_REGISTERED');
  return schema.parse(state);
}
