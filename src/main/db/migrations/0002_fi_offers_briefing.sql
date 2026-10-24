CREATE TABLE `ai_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`content` text NOT NULL,
	`context_hash` text NOT NULL,
	`provider` text,
	`model` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `offers` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant` text NOT NULL,
	`title` text NOT NULL,
	`details` text NOT NULL,
	`code` text,
	`valid_till` text,
	`source_url` text NOT NULL,
	`found_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `user_settings` ADD `fi_corpus_minor` integer;--> statement-breakpoint
ALTER TABLE `user_settings` ADD `fi_return_pct` real DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE `user_settings` ADD `fi_withdrawal_pct` real DEFAULT 4 NOT NULL;--> statement-breakpoint
ALTER TABLE `user_settings` ADD `fi_target_spend_minor` integer;