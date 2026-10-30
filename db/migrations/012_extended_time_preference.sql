ALTER TABLE users
  ADD COLUMN IF NOT EXISTS extended_time boolean NOT NULL DEFAULT false;
