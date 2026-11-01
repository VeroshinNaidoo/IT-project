CREATE TABLE IF NOT EXISTS programming_languages (
  language_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE
);

INSERT INTO programming_languages(name) VALUES
  ('JavaScript'), ('TypeScript'), ('Python'), ('Java'), ('C#'), ('SQL'),
  ('HTML/CSS'), ('PHP'), ('C'), ('C++')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS user_preferred_languages (
  user_id uuid NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  language_id uuid NOT NULL REFERENCES programming_languages(language_id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, language_id)
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_email text;
ALTER TABLE email_verification_tokens ADD COLUMN IF NOT EXISTS target_email text;
CREATE INDEX IF NOT EXISTS user_preferred_languages_language_idx
  ON user_preferred_languages(language_id);
