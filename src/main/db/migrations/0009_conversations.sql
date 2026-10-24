CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `conversation_id` text REFERENCES conversations(id);--> statement-breakpoint
INSERT INTO `conversations` (`id`, `title`, `created_at`, `updated_at`) SELECT 'earlier', COALESCE((SELECT substr(`content`, 1, 60) FROM `chat_messages` WHERE `role` = 'user' ORDER BY `created_at` LIMIT 1), 'Earlier chat'), MIN(`created_at`), MAX(`created_at`) FROM `chat_messages` HAVING COUNT(*) > 0;
--> statement-breakpoint
UPDATE `chat_messages` SET `conversation_id` = 'earlier' WHERE `conversation_id` IS NULL;
