CREATE TABLE IF NOT EXISTS ai_chat_attachments (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL REFERENCES ai_chats(id) ON DELETE CASCADE,
  message_id TEXT,
  object_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  status TEXT NOT NULL DEFAULT 'uploaded',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ai_chat_attachments_user_chat_status_idx
  ON ai_chat_attachments(user_id, chat_id, status);
CREATE INDEX IF NOT EXISTS ai_chat_attachments_chat_message_idx
  ON ai_chat_attachments(chat_id, message_id);
CREATE INDEX IF NOT EXISTS ai_chat_attachments_user_created_idx
  ON ai_chat_attachments(user_id, created_at);
