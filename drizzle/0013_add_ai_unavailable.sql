ALTER TYPE "public"."security_event_type" ADD VALUE 'ai_cost_cap_reached';--> statement-breakpoint
ALTER TYPE "public"."security_event_type" ADD VALUE 'ai_breaker_tripped';--> statement-breakpoint
ALTER TYPE "public"."evaluation_error" ADD VALUE 'budget' BEFORE 'not_json';--> statement-breakpoint
ALTER TYPE "public"."evaluation_error" ADD VALUE 'truncated' BEFORE 'not_json';--> statement-breakpoint
ALTER TYPE "public"."not_assessable_cause" ADD VALUE 'ai_unavailable';