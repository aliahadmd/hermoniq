CREATE TABLE IF NOT EXISTS events (
  id text PRIMARY KEY NOT NULL,
  user_id text NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  location text NOT NULL DEFAULT '',
  timezone text NOT NULL,
  is_all_day integer NOT NULL DEFAULT 0,
  start_at text NOT NULL,
  end_at text NOT NULL,
  reminder_minutes integer,
  source text NOT NULL DEFAULT 'manual',
  external_uid text,
  created_at text NOT NULL,
  updated_at text NOT NULL
);

CREATE INDEX IF NOT EXISTS events_user_start_idx ON events(user_id, start_at);
CREATE INDEX IF NOT EXISTS events_user_end_idx ON events(user_id, end_at);
CREATE UNIQUE INDEX IF NOT EXISTS events_user_external_uid_start_unique ON events(user_id, external_uid, start_at);
