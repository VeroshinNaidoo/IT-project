ALTER TABLE users
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS student_type text,
  ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;

UPDATE users
SET first_name = split_part(trim(full_name), ' ', 1),
    last_name = NULLIF(trim(substr(trim(full_name), length(split_part(trim(full_name), ' ', 1)) + 1)), '')
WHERE first_name IS NULL;

UPDATE users SET first_name = 'Legacy' WHERE first_name IS NULL OR length(trim(first_name)) = 0;
UPDATE users SET student_type = 'it' WHERE role = 'student' AND student_type IS NULL;

ALTER TABLE users
  ALTER COLUMN first_name SET DEFAULT 'Legacy',
  ALTER COLUMN first_name SET NOT NULL,
  ADD CONSTRAINT users_first_name_length CHECK (char_length(first_name) BETWEEN 1 AND 50),
  ADD CONSTRAINT users_last_name_length CHECK (last_name IS NULL OR char_length(last_name) BETWEEN 1 AND 50),
  ADD CONSTRAINT users_student_type_valid CHECK (student_type IS NULL OR student_type IN ('it', 'business')),
  ADD CONSTRAINT users_student_type_for_students CHECK (role = 'lecturer' OR student_type IS NOT NULL);

CREATE OR REPLACE FUNCTION eduquest_sync_identity_fields() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.first_name IS NULL OR trim(NEW.first_name) = '' THEN
    NEW.first_name := split_part(trim(NEW.full_name), ' ', 1);
  END IF;
  IF NEW.full_name IS NULL OR trim(NEW.full_name) = '' THEN
    NEW.full_name := trim(NEW.first_name || COALESCE(' ' || NULLIF(trim(NEW.last_name), ''), ''));
  END IF;
  IF NEW.role = 'student' AND NEW.student_type IS NULL THEN NEW.student_type := 'it'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS users_sync_identity_fields ON users;
CREATE TRIGGER users_sync_identity_fields BEFORE INSERT OR UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION eduquest_sync_identity_fields();

CREATE UNIQUE INDEX IF NOT EXISTS users_email_case_insensitive_unique ON users (lower(email));

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  token_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mfa_credentials (
  user_id uuid PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
  encrypted_secret text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
  recovery_code_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_verification_tokens_user_idx ON email_verification_tokens(user_id);
CREATE INDEX IF NOT EXISTS mfa_recovery_codes_user_idx ON mfa_recovery_codes(user_id);
