CREATE TABLE `ai_chats` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL REFERENCES user(id) ON DELETE cascade,
	`title` text NOT NULL DEFAULT 'New chat',
	`context_money` integer NOT NULL DEFAULT 1,
	`context_habits` integer NOT NULL DEFAULT 1,
	`context_notes` integer NOT NULL DEFAULT 0,
	`pinned` integer NOT NULL DEFAULT 0,
	`last_message_preview` text NOT NULL DEFAULT '',
	`last_active_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ai_chats_user_last_active_idx` ON `ai_chats` (`user_id`,`last_active_at`);
--> statement-breakpoint
CREATE TABLE `ai_pending_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL REFERENCES ai_chats(id) ON DELETE cascade,
	`user_id` text NOT NULL REFERENCES user(id) ON DELETE cascade,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`status` text NOT NULL DEFAULT 'pending',
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ai_pending_actions_chat_status_idx` ON `ai_pending_actions` (`chat_id`,`status`);
--> statement-breakpoint
CREATE INDEX `ai_pending_actions_user_status_idx` ON `ai_pending_actions` (`user_id`,`status`);
