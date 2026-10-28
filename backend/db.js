import pg from 'pg';

const { Pool } = pg;
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // PGlite serialises queries internally. Keeping the pool deliberately small
  // also prevents test workers from exhausting the socket server.
  max: Number(process.env.PG_POOL_MAX ?? 4),
});
