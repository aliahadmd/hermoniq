CREATE TABLE `note_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL REFERENCES `user`(`id`) ON DELETE cascade,
	`name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `note_categories_user_name_unique` ON `note_categories` (`user_id`,`name`);
--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL REFERENCES `user`(`id`) ON DELETE cascade,
	`title` text NOT NULL,
	`content` text NOT NULL DEFAULT '',
	`category_id` text REFERENCES `note_categories`(`id`) ON DELETE set null,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notes_user_updated_idx` ON `notes` (`user_id`,`updated_at`);
--> statement-breakpoint
CREATE INDEX `notes_user_category_idx` ON `notes` (`user_id`,`category_id`);
