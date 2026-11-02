ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'admin';

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS requires_password_reset boolean NOT NULL DEFAULT false;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_account_status_check;
ALTER TABLE users ADD CONSTRAINT users_account_status_check
  CHECK (account_status IN ('active','suspended'));
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_student_type_for_students;
ALTER TABLE users ADD CONSTRAINT users_student_type_for_students
  CHECK (role <> 'student' OR student_type IS NOT NULL);
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_student_year_for_students;
ALTER TABLE users ADD CONSTRAINT users_student_year_for_students
  CHECK (role <> 'student' OR student_year IS NOT NULL);

CREATE TABLE admin_audit_logs (
  audit_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (length(trim(action)) BETWEEN 1 AND 100),
  target_type text NOT NULL CHECK (length(trim(target_type)) BETWEEN 1 AND 60),
  target_id uuid,
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 3 AND 500),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  request_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX admin_audit_logs_created_idx ON admin_audit_logs(created_at DESC);
CREATE INDEX admin_audit_logs_admin_idx ON admin_audit_logs(admin_id,created_at DESC);

CREATE OR REPLACE FUNCTION protect_admin_audit_logs() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Admin audit logs are append-only';
END $$;

CREATE TRIGGER admin_audit_logs_append_only
BEFORE UPDATE OR DELETE ON admin_audit_logs
FOR EACH ROW EXECUTE FUNCTION protect_admin_audit_logs();
