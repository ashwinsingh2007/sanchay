CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`currency` text NOT NULL,
	`current_balance_minor` integer,
	`balance_as_of` text,
	`balance_source` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`color` text NOT NULL,
	`sort_order` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `import_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`filename` text NOT NULL,
	`imported_at` text NOT NULL,
	`row_count` integer NOT NULL,
	`imported_count` integer NOT NULL,
	`duplicate_count` integer NOT NULL,
	`source_hash` text NOT NULL,
	`date_range_start` text,
	`date_range_end` text,
	`is_sample` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `import_sources_account_idx` ON `import_sources` (`account_id`);--> statement-breakpoint
CREATE TABLE `insights` (
	`id` text PRIMARY KEY NOT NULL,
	`month` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`estimated_impact_minor` integer,
	`confidence` real,
	`severity` text NOT NULL,
	`evidence_json` text NOT NULL,
	`created_at` text NOT NULL,
	`dismissed_at` text
);
--> statement-breakpoint
CREATE INDEX `insights_month_idx` ON `insights` (`month`);--> statement-breakpoint
CREATE TABLE `merchant_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`match_type` text NOT NULL,
	`match_value` text NOT NULL,
	`merchant_normalised` text,
	`category_id` text NOT NULL,
	`priority` integer DEFAULT 100 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `recurring_commitments` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_key` text NOT NULL,
	`merchant_name` text NOT NULL,
	`category_id` text,
	`typical_amount_minor` integer NOT NULL,
	`cadence` text NOT NULL,
	`next_expected_date` text,
	`last_seen_date` text,
	`confidence` real NOT NULL,
	`status` text NOT NULL,
	`user_confirmed` integer DEFAULT false NOT NULL,
	`user_edited` integer DEFAULT false NOT NULL,
	`linked_transaction_ids` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recurring_merchant_key_idx` ON `recurring_commitments` (`merchant_key`);--> statement-breakpoint
CREATE TABLE `savings_goals` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`target_amount_minor` integer NOT NULL,
	`current_amount_minor` integer NOT NULL,
	`target_date` text NOT NULL,
	`monthly_contribution_minor` integer,
	`priority` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`import_source_id` text,
	`transaction_date` text NOT NULL,
	`description_original` text NOT NULL,
	`description_key` text NOT NULL,
	`merchant_normalised` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`direction` text NOT NULL,
	`category_id` text,
	`category_confidence` real NOT NULL,
	`category_source` text NOT NULL,
	`is_recurring` integer DEFAULT false NOT NULL,
	`is_transfer` integer DEFAULT false NOT NULL,
	`notes` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`import_source_id`) REFERENCES `import_sources`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `transactions_date_idx` ON `transactions` (`transaction_date`);--> statement-breakpoint
CREATE INDEX `transactions_account_idx` ON `transactions` (`account_id`);--> statement-breakpoint
CREATE INDEX `transactions_source_idx` ON `transactions` (`import_source_id`);--> statement-breakpoint
CREATE INDEX `transactions_dedupe_idx` ON `transactions` (`account_id`,`transaction_date`,`amount_minor`);--> statement-breakpoint
CREATE TABLE `user_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`primary_currency` text NOT NULL,
	`next_income_date` text,
	`expected_income_minor` integer,
	`emergency_buffer_minor` integer DEFAULT 0 NOT NULL,
	`monthly_savings_target_minor` integer,
	`planning_start_day` integer DEFAULT 1 NOT NULL,
	`recurring_tolerance_pct` integer DEFAULT 15 NOT NULL,
	`onboarding_complete` integer DEFAULT false NOT NULL
);
