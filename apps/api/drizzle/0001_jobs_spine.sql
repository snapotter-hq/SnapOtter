ALTER TYPE "public"."job_status" ADD VALUE 'canceled';--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "tool_id" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "pool" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "input_refs" jsonb;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "output_refs" jsonb;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "bytes_in" bigint;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "bytes_out" bigint;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "duration_ms" integer;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "error_jsonb" jsonb;--> statement-breakpoint
UPDATE "jobs" SET "error_jsonb" = jsonb_build_object('message', "error") WHERE "error" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" DROP COLUMN "error";--> statement-breakpoint
ALTER TABLE "jobs" RENAME COLUMN "error_jsonb" TO "error";--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "progress_jsonb" jsonb;--> statement-breakpoint
UPDATE "jobs" SET "progress_jsonb" = jsonb_build_object('percent', round("progress" * 100)) WHERE "progress" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" DROP COLUMN "progress";--> statement-breakpoint
ALTER TABLE "jobs" RENAME COLUMN "progress_jsonb" TO "progress";--> statement-breakpoint
UPDATE "jobs" SET "input_refs" = '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "jobs" DROP COLUMN "input_files";--> statement-breakpoint
ALTER TABLE "jobs" DROP COLUMN "output_path";--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jobs_created_at_idx" ON "jobs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "jobs_status_idx" ON "jobs" USING btree ("status");
