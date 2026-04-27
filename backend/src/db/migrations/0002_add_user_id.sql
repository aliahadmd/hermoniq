-- Add user_id column to accounts
ALTER TABLE `accounts` ADD COLUMN `user_id` TEXT REFERENCES `user`(`id`) ON DELETE CASCADE;
--> statement-breakpoint
-- Add user_id column to categories
ALTER TABLE `categories` ADD COLUMN `user_id` TEXT REFERENCES `user`(`id`) ON DELETE CASCADE;
--> statement-breakpoint
-- Add user_id column to transactions
ALTER TABLE `transactions` ADD COLUMN `user_id` TEXT REFERENCES `user`(`id`) ON DELETE CASCADE;
--> statement-breakpoint
-- Add user_id column to profiles (without UNIQUE — SQLite can't add UNIQUE via ALTER TABLE)
ALTER TABLE `profiles` ADD COLUMN `user_id` TEXT REFERENCES `user`(`id`) ON DELETE CASCADE;
--> statement-breakpoint
-- Create unique index on profiles.user_id separately
CREATE UNIQUE INDEX `profiles_user_id_unique` ON `profiles` (`user_id`);
