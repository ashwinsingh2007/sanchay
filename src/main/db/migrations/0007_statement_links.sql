CREATE TABLE `transaction_sources` (
	`transaction_id` text NOT NULL,
	`import_source_id` text NOT NULL,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`import_source_id`) REFERENCES `import_sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transaction_sources_pk` ON `transaction_sources` (`transaction_id`,`import_source_id`);--> statement-breakpoint
CREATE INDEX `transaction_sources_source_idx` ON `transaction_sources` (`import_source_id`);--> statement-breakpoint
INSERT OR IGNORE INTO `transaction_sources` (`transaction_id`, `import_source_id`) SELECT `id`, `import_source_id` FROM `transactions` WHERE `import_source_id` IS NOT NULL;
