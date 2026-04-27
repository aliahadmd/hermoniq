ALTER TABLE `notes` ADD `is_pinned` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `notes` ADD `archived_at` text;
--> statement-breakpoint
CREATE INDEX `notes_user_archived_updated_idx` ON `notes` (`user_id`,`archived_at`,`updated_at`);
--> statement-breakpoint
CREATE INDEX `notes_user_pinned_updated_idx` ON `notes` (`user_id`,`is_pinned`,`updated_at`);
