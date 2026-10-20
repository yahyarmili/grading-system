ALTER TYPE "public"."security_event_type" ADD VALUE 'ai_configuration_failed';--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "evaluation_request" text;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_evaluation_request_status" CHECK ("submissions"."evaluation_request" is null or "submissions"."status" in ('evaluation_failed', 'not_assessable'));