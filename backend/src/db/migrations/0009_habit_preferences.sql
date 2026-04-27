CREATE TABLE `habit_preferences` (
	`user_id` text PRIMARY KEY NOT NULL REFERENCES `user`(`id`) ON DELETE cascade,
	`week_start` text NOT NULL DEFAULT 'device',
	`default_filter` text NOT NULL DEFAULT 'all',
	`timeline_days` integer NOT NULL DEFAULT 30,
	`show_archived_by_default` integer NOT NULL DEFAULT 0,
	`require_note_for_completion` integer NOT NULL DEFAULT 0,
	`reminder_master_enabled` integer NOT NULL DEFAULT 1,
	`default_reminder_enabled` integer NOT NULL DEFAULT 0,
	`default_reminder_time` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
