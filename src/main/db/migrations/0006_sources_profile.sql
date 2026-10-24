CREATE TABLE `cfo_profile` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`source` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `data_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`auth` text NOT NULL,
	`token_auth_method` text DEFAULT 'none' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`builtin` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
