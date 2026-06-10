ALTER TABLE users ADD COLUMN analytics_enabled integer;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN analytics_consent_shown_at integer;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN analytics_consent_remind_at integer;
