-- Add new profile columns
ALTER TABLE `profiles` ADD COLUMN `username` TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `profiles` ADD COLUMN `about` TEXT;
--> statement-breakpoint
ALTER TABLE `profiles` ADD COLUMN `location` TEXT;
--> statement-breakpoint
ALTER TABLE `profiles` ADD COLUMN `gender` TEXT;
--> statement-breakpoint
ALTER TABLE `profiles` ADD COLUMN `website` TEXT;
--> statement-breakpoint
ALTER TABLE `profiles` ADD COLUMN `work_company` TEXT;
--> statement-breakpoint
ALTER TABLE `profiles` ADD COLUMN `work_position` TEXT;
--> statement-breakpoint
ALTER TABLE `profiles` ADD COLUMN `work_description` TEXT;
--> statement-breakpoint
ALTER TABLE `profiles` ADD COLUMN `education_school` TEXT;
--> statement-breakpoint
ALTER TABLE `profiles` ADD COLUMN `education_degree` TEXT;
--> statement-breakpoint
ALTER TABLE `profiles` ADD COLUMN `education_graduated` INTEGER;
--> statement-breakpoint
-- Backfill existing profiles with unique usernames using 'user-' prefix and hex(randomblob)
-- Each profile gets a username like 'user-a1b2c3d4' derived from 4 random bytes (8 hex chars)
UPDATE `profiles` SET `username` = 'user-' || lower(hex(randomblob(4))) WHERE `username` = '';
--> statement-breakpoint
-- Create unique index on username (safe now that all rows have unique values)
CREATE UNIQUE INDEX `idx_profiles_username` ON `profiles` (`username`);
