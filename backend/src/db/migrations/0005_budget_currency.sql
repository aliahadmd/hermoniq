ALTER TABLE `monthly_budgets` ADD COLUMN `currency` text NOT NULL DEFAULT 'BDT';
--> statement-breakpoint
DROP INDEX IF EXISTS `monthly_budgets_user_month_category_unique`;
--> statement-breakpoint
CREATE UNIQUE INDEX `monthly_budgets_user_month_category_currency_unique`
ON `monthly_budgets` (`user_id`,`month`,`category_id`,`currency`);
