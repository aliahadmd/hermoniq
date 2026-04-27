CREATE TABLE `monthly_budgets__new` (
	`id` text PRIMARY KEY NOT NULL,
	`month` text NOT NULL,
	`amount_limit` integer NOT NULL,
	`category_id` text NOT NULL REFERENCES `categories`(`id`) ON DELETE cascade,
	`account_id` text NOT NULL REFERENCES `accounts`(`id`) ON DELETE cascade,
	`user_id` text NOT NULL REFERENCES `user`(`id`) ON DELETE cascade,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `monthly_budgets__new` (
	`id`,
	`month`,
	`amount_limit`,
	`category_id`,
	`account_id`,
	`user_id`,
	`created_at`,
	`updated_at`
)
SELECT
	mb.`id`,
	mb.`month`,
	mb.`amount_limit`,
	mb.`category_id`,
	COALESCE(
		(
			SELECT a.`id`
			FROM `accounts` a
			WHERE a.`user_id` = mb.`user_id` AND a.`currency` = mb.`currency`
			ORDER BY a.`created_at` ASC, a.`id` ASC
			LIMIT 1
		),
		(
			SELECT a.`id`
			FROM `accounts` a
			WHERE a.`user_id` = mb.`user_id`
			ORDER BY a.`created_at` ASC, a.`id` ASC
			LIMIT 1
		)
	) AS `account_id`,
	mb.`user_id`,
	mb.`created_at`,
	mb.`updated_at`
FROM `monthly_budgets` mb
WHERE COALESCE(
	(
		SELECT a.`id`
		FROM `accounts` a
		WHERE a.`user_id` = mb.`user_id` AND a.`currency` = mb.`currency`
		ORDER BY a.`created_at` ASC, a.`id` ASC
		LIMIT 1
	),
	(
		SELECT a.`id`
		FROM `accounts` a
		WHERE a.`user_id` = mb.`user_id`
		ORDER BY a.`created_at` ASC, a.`id` ASC
		LIMIT 1
	)
) IS NOT NULL;
--> statement-breakpoint
DROP TABLE `monthly_budgets`;
--> statement-breakpoint
ALTER TABLE `monthly_budgets__new` RENAME TO `monthly_budgets`;
--> statement-breakpoint
CREATE UNIQUE INDEX `monthly_budgets_user_month_account_category_unique`
ON `monthly_budgets` (`user_id`,`month`,`account_id`,`category_id`);
