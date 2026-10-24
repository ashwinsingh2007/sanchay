CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`provider` text,
	`model` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `secrets` (
	`name` text PRIMARY KEY NOT NULL,
	`encrypted` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `insights` ADD `completed_at` text;--> statement-breakpoint
ALTER TABLE `user_settings` ADD `ai_provider` text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `user_settings` ADD `ai_model` text;--> statement-breakpoint
ALTER TABLE `user_settings` ADD `ollama_url` text DEFAULT 'http://127.0.0.1:11434' NOT NULL;--> statement-breakpoint
ALTER TABLE `user_settings` ADD `cloud_consent` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `user_settings` ADD `goal_text` text;