CREATE TYPE "public"."ai_provider" AS ENUM('simulator', 'openrouter');--> statement-breakpoint
CREATE TYPE "public"."evaluation_error" AS ENUM('timeout', 'rate_limited', 'unavailable', 'rejected', 'configuration', 'not_json', 'schema', 'quote_not_found', 'superseded', 'internal');--> statement-breakpoint
CREATE TYPE "public"."evaluation_outcome" AS ENUM('proposed', 'failed', 'not_assessable');--> statement-breakpoint
CREATE TYPE "public"."not_assessable_cause" AS ENUM('no_content', 'rubric_unavailable');--> statement-breakpoint
CREATE TYPE "public"."proposal_alert" AS ENUM('very_short', 'other_language', 'off_topic', 'addressed_to_marker');--> statement-breakpoint
CREATE TABLE "ai_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"submission_id" uuid NOT NULL,
	"version_number" smallint NOT NULL,
	"level_task" smallint NOT NULL,
	"level_organization" smallint NOT NULL,
	"level_vocabulary" smallint NOT NULL,
	"level_grammar" smallint NOT NULL,
	"level_mechanics" smallint NOT NULL,
	"justification_task" text NOT NULL,
	"justification_organization" text NOT NULL,
	"justification_vocabulary" text NOT NULL,
	"justification_grammar" text NOT NULL,
	"justification_mechanics" text NOT NULL,
	"quotes_task" text[] NOT NULL,
	"quotes_organization" text[] NOT NULL,
	"quotes_vocabulary" text[] NOT NULL,
	"quotes_grammar" text[] NOT NULL,
	"quotes_mechanics" text[] NOT NULL,
	"general_comment" text NOT NULL,
	"next_steps" text[] NOT NULL,
	"alerts" "proposal_alert"[] DEFAULT '{}' NOT NULL,
	"proposed_grade" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_proposals_run_unique" UNIQUE("run_id"),
	CONSTRAINT "ai_proposals_id_submission_version_unique" UNIQUE("id","submission_id","version_number"),
	CONSTRAINT "ai_proposals_levels_range" CHECK ("ai_proposals"."level_task" between 0 and 4 and "ai_proposals"."level_organization" between 0 and 4 and "ai_proposals"."level_vocabulary" between 0 and 4 and "ai_proposals"."level_grammar" between 0 and 4 and "ai_proposals"."level_mechanics" between 0 and 4),
	CONSTRAINT "ai_proposals_justifications_not_blank" CHECK (btrim("ai_proposals"."justification_task") <> '' and btrim("ai_proposals"."justification_organization") <> '' and btrim("ai_proposals"."justification_vocabulary") <> '' and btrim("ai_proposals"."justification_grammar") <> '' and btrim("ai_proposals"."justification_mechanics") <> ''),
	CONSTRAINT "ai_proposals_quotes_present" CHECK (cardinality("ai_proposals"."quotes_task") >= 1 and cardinality("ai_proposals"."quotes_organization") >= 1 and cardinality("ai_proposals"."quotes_vocabulary") >= 1 and cardinality("ai_proposals"."quotes_grammar") >= 1 and cardinality("ai_proposals"."quotes_mechanics") >= 1),
	CONSTRAINT "ai_proposals_general_comment_not_blank" CHECK (btrim("ai_proposals"."general_comment") <> ''),
	CONSTRAINT "ai_proposals_next_steps_present" CHECK (cardinality("ai_proposals"."next_steps") >= 1),
	CONSTRAINT "ai_proposals_grade_is_sum" CHECK ("ai_proposals"."proposed_grade" = "ai_proposals"."level_task" + "ai_proposals"."level_organization" + "ai_proposals"."level_vocabulary" + "ai_proposals"."level_grammar" + "ai_proposals"."level_mechanics")
);
--> statement-breakpoint
CREATE TABLE "evaluation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"version_number" smallint NOT NULL,
	"outcome" "evaluation_outcome" NOT NULL,
	"not_assessable_cause" "not_assessable_cause",
	"provider" "ai_provider" NOT NULL,
	"model_requested" text,
	"model_answered" text,
	"provider_answered" text,
	"prompt_version" text,
	"rubric_version" text,
	"attempts" smallint NOT NULL,
	"attempt_errors" "evaluation_error"[] DEFAULT '{}' NOT NULL,
	"duration_ms" integer NOT NULL,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"total_tokens" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evaluation_runs_id_submission_version_unique" UNIQUE("id","submission_id","version_number"),
	CONSTRAINT "evaluation_runs_duration_not_negative" CHECK ("evaluation_runs"."duration_ms" >= 0),
	CONSTRAINT "evaluation_runs_cause_iff_not_assessable" CHECK (("evaluation_runs"."outcome" = 'not_assessable') = ("evaluation_runs"."not_assessable_cause" is not null)),
	CONSTRAINT "evaluation_runs_versions_iff_assessable" CHECK (("evaluation_runs"."outcome" = 'not_assessable') = ("evaluation_runs"."prompt_version" is null) and ("evaluation_runs"."outcome" = 'not_assessable') = ("evaluation_runs"."rubric_version" is null)),
	CONSTRAINT "evaluation_runs_proposed" CHECK ("evaluation_runs"."outcome" <> 'proposed' or ("evaluation_runs"."model_requested" is not null and "evaluation_runs"."attempts" >= 1 and cardinality("evaluation_runs"."attempt_errors") = "evaluation_runs"."attempts" - 1)),
	CONSTRAINT "evaluation_runs_failed" CHECK ("evaluation_runs"."outcome" <> 'failed' or ("evaluation_runs"."attempts" >= 1 and cardinality("evaluation_runs"."attempt_errors") = "evaluation_runs"."attempts")),
	CONSTRAINT "evaluation_runs_not_assessable" CHECK ("evaluation_runs"."outcome" <> 'not_assessable' or ("evaluation_runs"."attempts" = 0 and cardinality("evaluation_runs"."attempt_errors") = 0 and "evaluation_runs"."model_requested" is null))
);
--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "current_proposal_id" uuid;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "not_assessable_cause" "not_assessable_cause";--> statement-breakpoint
ALTER TABLE "ai_proposals" ADD CONSTRAINT "ai_proposals_run_fk" FOREIGN KEY ("run_id","submission_id","version_number") REFERENCES "public"."evaluation_runs"("id","submission_id","version_number") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_runs" ADD CONSTRAINT "evaluation_runs_version_fk" FOREIGN KEY ("submission_id","version_number") REFERENCES "public"."submission_versions"("submission_id","number") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evaluation_runs_submission_id_idx" ON "evaluation_runs" USING btree ("submission_id");--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_current_proposal_fk" FOREIGN KEY ("current_proposal_id","id","current_version") REFERENCES "public"."ai_proposals"("id","submission_id","version_number") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_current_proposal_status" CHECK ("submissions"."current_proposal_id" is null or "submissions"."status" in ('to_review', 'validated', 'published'));--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_not_assessable_cause" CHECK (("submissions"."status" = 'not_assessable') = ("submissions"."not_assessable_cause" is not null));