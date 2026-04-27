CREATE TABLE `habits` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL REFERENCES `user`(`id`) ON DELETE cascade,
	`name` text NOT NULL,
	`question` text NOT NULL,
	`type` text NOT NULL,
	`color` text NOT NULL,
	`unit` text,
	`daily_target` integer,
	`frequency_type` text NOT NULL,
	`frequency_days` text NOT NULL DEFAULT '[]',
	`reminder_enabled` integer NOT NULL DEFAULT 0,
	`reminder_time` text,
	`notes` text NOT NULL DEFAULT '',
	`start_date` text NOT NULL,
	`archived_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `habits_user_archived_idx` ON `habits` (`user_id`,`archived_at`);
--> statement-breakpoint
CREATE TABLE `habit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`habit_id` text NOT NULL REFERENCES `habits`(`id`) ON DELETE cascade,
	`user_id` text NOT NULL REFERENCES `user`(`id`) ON DELETE cascade,
	`log_date` text NOT NULL,
	`completed` integer NOT NULL DEFAULT 0,
	`value` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `habit_logs_habit_date_unique` ON `habit_logs` (`habit_id`,`log_date`);
--> statement-breakpoint
CREATE INDEX `habit_logs_habit_date_idx` ON `habit_logs` (`habit_id`,`log_date`);
