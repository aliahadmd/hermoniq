CREATE TABLE `user` (
	`id` TEXT PRIMARY KEY NOT NULL,
	`name` TEXT NOT NULL,
	`email` TEXT NOT NULL,
	`emailVerified` INTEGER NOT NULL DEFAULT 0,
	`image` TEXT,
	`role` TEXT DEFAULT 'user',
	`banned` INTEGER DEFAULT 0,
	`banReason` TEXT,
	`banExpires` INTEGER,
	`createdAt` INTEGER NOT NULL,
	`updatedAt` INTEGER NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` TEXT PRIMARY KEY NOT NULL,
	`userId` TEXT NOT NULL,
	`token` TEXT NOT NULL,
	`expiresAt` INTEGER NOT NULL,
	`ipAddress` TEXT,
	`userAgent` TEXT,
	`createdAt` INTEGER NOT NULL,
	`updatedAt` INTEGER NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);
--> statement-breakpoint
CREATE TABLE `account` (
	`id` TEXT PRIMARY KEY NOT NULL,
	`userId` TEXT NOT NULL,
	`accountId` TEXT NOT NULL,
	`providerId` TEXT NOT NULL,
	`accessToken` TEXT,
	`refreshToken` TEXT,
	`accessTokenExpiresAt` INTEGER,
	`refreshTokenExpiresAt` INTEGER,
	`scope` TEXT,
	`idToken` TEXT,
	`password` TEXT,
	`createdAt` INTEGER NOT NULL,
	`updatedAt` INTEGER NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`)
);
--> statement-breakpoint
CREATE TABLE `verification` (
	`id` TEXT PRIMARY KEY NOT NULL,
	`identifier` TEXT NOT NULL,
	`value` TEXT NOT NULL,
	`expiresAt` INTEGER NOT NULL,
	`createdAt` INTEGER NOT NULL,
	`updatedAt` INTEGER NOT NULL
);
