-- Remove branding:manage from built-in admin role permissions
UPDATE `roles`
SET `permissions` = REPLACE(`permissions`, '"branding:manage",', ''),
    `updated_at` = unixepoch()
WHERE `id` = 'builtin-admin';
--> statement-breakpoint
-- Remove branding:manage from any custom roles that have it
UPDATE `roles`
SET `permissions` = REPLACE(REPLACE(`permissions`, ',"branding:manage"', ''), '"branding:manage",', ''),
    `updated_at` = unixepoch()
WHERE `id` != 'builtin-admin' AND `permissions` LIKE '%branding:manage%';
--> statement-breakpoint
-- Clean up branding-related settings
DELETE FROM `settings` WHERE `key` IN ('customLogo', 'appName');
