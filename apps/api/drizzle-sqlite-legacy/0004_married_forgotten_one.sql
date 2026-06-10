CREATE TABLE `user_files` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`original_name` text NOT NULL,
	`stored_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`width` integer,
	`height` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`parent_id` text,
	`tool_chain` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
