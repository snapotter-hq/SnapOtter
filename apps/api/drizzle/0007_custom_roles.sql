-- Create roles table
CREATE TABLE IF NOT EXISTS `roles` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `description` text NOT NULL DEFAULT '',
  `permissions` text NOT NULL,
  `is_builtin` integer NOT NULL DEFAULT 0,
  `created_by` text REFERENCES `users`(`id`) ON DELETE SET NULL,
  `created_at` integer NOT NULL DEFAULT (unixepoch()),
  `updated_at` integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `roles_name_unique` ON `roles` (`name`);
--> statement-breakpoint
-- Seed built-in roles
INSERT OR IGNORE INTO `roles` (`id`, `name`, `description`, `permissions`, `is_builtin`) VALUES
  ('builtin-admin', 'admin', 'Full administrative access', '["tools:use","files:own","files:all","apikeys:own","apikeys:all","pipelines:own","pipelines:all","settings:read","settings:write","users:manage","teams:manage","branding:manage","features:manage","system:health","audit:read"]', 1),
  ('builtin-editor', 'editor', 'Can see all files and pipelines', '["tools:use","files:own","files:all","apikeys:own","pipelines:own","pipelines:all","settings:read"]', 1),
  ('builtin-user', 'user', 'Basic tool access', '["tools:use","files:own","apikeys:own","pipelines:own","settings:read"]', 1);
