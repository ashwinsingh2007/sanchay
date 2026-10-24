CREATE TABLE `ai_categories` (
	`key` text PRIMARY KEY NOT NULL,
	`category_id` text NOT NULL,
	`merchant` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
