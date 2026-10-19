ALTER TYPE "public"."ai_provider" ADD VALUE 'anthropic';--> statement-breakpoint
ALTER TYPE "public"."evaluation_error" ADD VALUE 'refused' BEFORE 'not_json';