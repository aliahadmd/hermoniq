CREATE TABLE `monthly_budgets` (
	`id` text PRIMARY KEY NOT NULL,
	`month` text NOT NULL,
	`amount_limit` integer NOT NULL,
	`category_id` text NOT NULL REFERENCES `categories`(`id`) ON DELETE cascade,
	`user_id` text NOT NULL REFERENCES `user`(`id`) ON DELETE cascade,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `monthly_budgets_user_month_category_unique` ON `monthly_budgets` (`user_id`,`month`,`category_id`);
