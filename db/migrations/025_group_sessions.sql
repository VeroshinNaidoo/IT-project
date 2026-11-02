CREATE TABLE group_sessions (
  session_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES study_groups(group_id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 120),
  topic text NOT NULL CHECK (length(trim(topic)) BETWEEN 1 AND 200),
  topic_ref uuid REFERENCES topics(topic_id) ON DELETE SET NULL,
  description text NOT NULL DEFAULT '' CHECK (length(description)<=2000),
  preparation_notes text NOT NULL DEFAULT '' CHECK (length(preparation_notes)<=2000),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  mode text NOT NULL CHECK (mode IN ('in_person','online')),
  location text NOT NULL CHECK (length(trim(location)) BETWEEN 1 AND 500),
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','cancelled')),
  cancel_reason text CHECK (length(cancel_reason)<=500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at>starts_at AND ends_at<=starts_at+interval '8 hours'),
  CHECK (status<>'cancelled' OR (cancel_reason IS NOT NULL AND length(trim(cancel_reason))>0))
);
CREATE INDEX group_sessions_calendar_idx ON group_sessions(group_id,starts_at);
CREATE TABLE session_preparation_resources (
  session_id uuid NOT NULL REFERENCES group_sessions(session_id) ON DELETE CASCADE,
  resource_id uuid NOT NULL REFERENCES resources(resource_id) ON DELETE CASCADE,
  PRIMARY KEY(session_id,resource_id)
);
CREATE TABLE session_rsvps (
  session_id uuid NOT NULL REFERENCES group_sessions(session_id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  response text NOT NULL CHECK(response IN ('going','maybe','not_going')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(session_id,student_id)
);
CREATE TABLE notifications (
  notification_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES group_sessions(session_id) ON DELETE CASCADE,
  kind text NOT NULL CHECK(kind IN ('created','changed','cancelled','reminder_24h','reminder_1h')),
  payload jsonb NOT NULL,
  dedup_key text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,dedup_key)
);
CREATE INDEX notifications_owner_idx ON notifications(user_id,created_at DESC);
ALTER TABLE group_updates ADD COLUMN session_id uuid REFERENCES group_sessions(session_id) ON DELETE SET NULL;

CREATE FUNCTION validate_group_session() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' AND NEW.starts_at<=now() THEN RAISE EXCEPTION 'Session must start in the future'; END IF;
  IF NEW.topic_ref IS NOT NULL AND NOT EXISTS(SELECT 1 FROM topics t JOIN study_groups g ON g.module_id=t.module_id WHERE t.topic_id=NEW.topic_ref AND g.group_id=NEW.group_id) THEN RAISE EXCEPTION 'Session topic must belong to group module'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER group_session_scope BEFORE INSERT OR UPDATE ON group_sessions FOR EACH ROW EXECUTE FUNCTION validate_group_session();
CREATE FUNCTION validate_session_resource() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM group_sessions s JOIN study_groups g USING(group_id) JOIN resources r ON r.module_id=g.module_id AND (r.group_id IS NULL OR r.group_id=g.group_id) WHERE s.session_id=NEW.session_id AND r.resource_id=NEW.resource_id) THEN RAISE EXCEPTION 'Preparation resource outside group scope'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER session_resource_scope BEFORE INSERT OR UPDATE ON session_preparation_resources FOR EACH ROW EXECUTE FUNCTION validate_session_resource();
CREATE FUNCTION validate_session_rsvp() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM group_sessions s JOIN group_members gm USING(group_id) WHERE s.session_id=NEW.session_id AND gm.student_id=NEW.student_id AND s.status='scheduled') THEN RAISE EXCEPTION 'Only members can RSVP to scheduled sessions'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER session_rsvp_scope BEFORE INSERT OR UPDATE ON session_rsvps FOR EACH ROW EXECUTE FUNCTION validate_session_rsvp();
CREATE FUNCTION remove_departed_session_data() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM session_rsvps r USING group_sessions s WHERE r.session_id=s.session_id AND s.group_id=OLD.group_id AND r.student_id=OLD.student_id;
  DELETE FROM notifications n USING group_sessions s WHERE n.session_id=s.session_id AND s.group_id=OLD.group_id AND n.user_id=OLD.student_id;
  RETURN OLD;
END $$;
CREATE TRIGGER group_member_session_cleanup AFTER DELETE ON group_members FOR EACH ROW EXECUTE FUNCTION remove_departed_session_data();
