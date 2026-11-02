ALTER TABLE notifications ALTER COLUMN session_id DROP NOT NULL;
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check CHECK (kind IN ('created','changed','cancelled','reminder_24h','reminder_1h','message','announcement','reply'));
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS message_id uuid;

CREATE TABLE group_messages (
  message_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES study_groups(group_id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  kind text NOT NULL DEFAULT 'message' CHECK (kind IN ('message','announcement')),
  body text NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 1000),
  reply_to_id uuid REFERENCES group_messages(message_id) ON DELETE SET NULL,
  pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid REFERENCES users(user_id) ON DELETE SET NULL
);
CREATE INDEX group_messages_cursor_idx ON group_messages(group_id, message_id DESC);
CREATE INDEX group_messages_pinned_idx ON group_messages(group_id, pinned, created_at DESC);
ALTER TABLE notifications ADD CONSTRAINT notifications_message_fk FOREIGN KEY (message_id) REFERENCES group_messages(message_id) ON DELETE CASCADE;

CREATE TABLE group_message_attachments (
  attachment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES group_messages(message_id) ON DELETE CASCADE,
  resource_id uuid REFERENCES resources(resource_id) ON DELETE CASCADE,
  stored_name text,
  original_name text,
  mime_type text,
  size_bytes integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((resource_id IS NOT NULL AND stored_name IS NULL) OR (resource_id IS NULL AND stored_name IS NOT NULL AND original_name IS NOT NULL AND mime_type IS NOT NULL AND size_bytes BETWEEN 1 AND 5242880))
);
CREATE INDEX group_message_attachments_message_idx ON group_message_attachments(message_id);

CREATE TABLE group_message_reads (
  group_id uuid NOT NULL REFERENCES study_groups(group_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  last_read_message_id uuid REFERENCES group_messages(message_id) ON DELETE SET NULL,
  PRIMARY KEY(group_id,user_id)
);
CREATE TABLE group_mutes (
  group_id uuid NOT NULL REFERENCES study_groups(group_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  muted_until timestamptz NOT NULL,
  muted_by uuid NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 300),
  PRIMARY KEY(group_id,user_id)
);
CREATE TABLE message_reports (
  report_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES group_messages(message_id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 500),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','actioned','dismissed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX message_reports_open_idx ON message_reports(status,created_at DESC);

CREATE OR REPLACE FUNCTION remove_departed_group_message_data() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM group_message_reads WHERE group_id=OLD.group_id AND user_id=OLD.student_id;
  DELETE FROM group_mutes WHERE group_id=OLD.group_id AND user_id=OLD.student_id;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS group_member_message_cleanup ON group_members;
CREATE TRIGGER group_member_message_cleanup AFTER DELETE ON group_members FOR EACH ROW EXECUTE FUNCTION remove_departed_group_message_data();
