-- Add permissions column to api_keys for scoped API keys
ALTER TABLE `api_keys` ADD COLUMN `permissions` text;
--> statement-breakpoint
-- Create audit_log table for queryable audit trail
CREATE TABLE IF NOT EXISTS `audit_log` (
  `id` text PRIMARY KEY NOT NULL,
  `actor_id` text REFERENCES `users`(`id`) ON DELETE SET NULL,
  `actor_username` text NOT NULL,
  `action` text NOT NULL,
  `target_type` text,
  `target_id` text,
  `details` text,
  `ip_address` text,
  `created_at` integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `audit_log_action_idx` ON `audit_log` (`action`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `audit_log_created_at_idx` ON `audit_log` (`created_at`);
