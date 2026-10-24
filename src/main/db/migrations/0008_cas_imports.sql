CREATE TABLE `cas_imports` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`filename` text NOT NULL,
	`file_hash` text NOT NULL,
	`statement_date` text,
	`total_value_minor` integer NOT NULL,
	`content` text NOT NULL,
	`imported_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cas_imports_file_hash_unique` ON `cas_imports` (`file_hash`);