ALTER TABLE `api_keys` ADD `key_prefix` text;--> statement-breakpoint
ALTER TABLE `pipelines` ADD `user_id` text REFERENCES users(id);