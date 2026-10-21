CREATE TYPE "public"."review_event" AS ENUM('list_opened', 'copy_opened', 'evaluation_created', 'evaluation_changed', 'retry_requested', 'relaunch_requested', 'retry_abandoned', 'manual_started', 'validated', 'published', 'unpublished', 'sent_back_to_review');--> statement-breakpoint
CREATE TYPE "public"."teacher_evaluation_origin" AS ENUM('proposal', 'manual');--> statement-breakpoint
ALTER TYPE "public"."security_event_type" ADD VALUE 'ai_provider_unreachable';--> statement-breakpoint
ALTER TYPE "public"."notice_kind" ADD VALUE 'teacher_review';--> statement-breakpoint
CREATE TABLE "review_journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"submission_id" uuid,
	"actor_id" uuid,
	"event" "review_event" NOT NULL,
	"field" text,
	"old_value" jsonb,
	"new_value" jsonb,
	"evaluation_revision" integer,
	"version_number" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_journal_entries_submission_iff_copy" CHECK (("review_journal_entries"."event" = 'list_opened') = ("review_journal_entries"."submission_id" is null)),
	CONSTRAINT "review_journal_entries_field_iff_change" CHECK (("review_journal_entries"."event" = 'evaluation_changed') = ("review_journal_entries"."field" is not null)),
	CONSTRAINT "review_journal_entries_revision_of_writes" CHECK ("review_journal_entries"."event" not in ('evaluation_created', 'evaluation_changed') or "review_journal_entries"."evaluation_revision" is not null)
);
--> statement-breakpoint
CREATE TABLE "teacher_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"version_number" smallint NOT NULL,
	"origin" "teacher_evaluation_origin" NOT NULL,
	"proposal_id" uuid,
	"rubric_version" text NOT NULL,
	"level_task" smallint,
	"level_organization" smallint,
	"level_vocabulary" smallint,
	"level_grammar" smallint,
	"level_mechanics" smallint,
	"remark_task" text DEFAULT '' NOT NULL,
	"remark_organization" text DEFAULT '' NOT NULL,
	"remark_vocabulary" text DEFAULT '' NOT NULL,
	"remark_grammar" text DEFAULT '' NOT NULL,
	"remark_mechanics" text DEFAULT '' NOT NULL,
	"reread_task" boolean DEFAULT false NOT NULL,
	"reread_organization" boolean DEFAULT false NOT NULL,
	"reread_vocabulary" boolean DEFAULT false NOT NULL,
	"reread_grammar" boolean DEFAULT false NOT NULL,
	"reread_mechanics" boolean DEFAULT false NOT NULL,
	"general_comment" text DEFAULT '' NOT NULL,
	"next_steps" text[] DEFAULT '{}' NOT NULL,
	"final_grade" numeric(4, 2),
	"grade_fixed" boolean DEFAULT false NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teacher_evaluations_submission_unique" UNIQUE("submission_id"),
	CONSTRAINT "teacher_evaluations_proposal_iff_origin" CHECK (("teacher_evaluations"."origin" = 'proposal') = ("teacher_evaluations"."proposal_id" is not null)),
	CONSTRAINT "teacher_evaluations_levels_range" CHECK (("teacher_evaluations"."level_task" is null or "teacher_evaluations"."level_task" between 0 and 4) and ("teacher_evaluations"."level_organization" is null or "teacher_evaluations"."level_organization" between 0 and 4) and ("teacher_evaluations"."level_vocabulary" is null or "teacher_evaluations"."level_vocabulary" between 0 and 4) and ("teacher_evaluations"."level_grammar" is null or "teacher_evaluations"."level_grammar" between 0 and 4) and ("teacher_evaluations"."level_mechanics" is null or "teacher_evaluations"."level_mechanics" between 0 and 4)),
	CONSTRAINT "teacher_evaluations_proposal_levels" CHECK ("teacher_evaluations"."origin" <> 'proposal' or ("teacher_evaluations"."level_task" is not null and "teacher_evaluations"."level_organization" is not null and "teacher_evaluations"."level_vocabulary" is not null and "teacher_evaluations"."level_grammar" is not null and "teacher_evaluations"."level_mechanics" is not null)),
	CONSTRAINT "teacher_evaluations_grade_range" CHECK ("teacher_evaluations"."final_grade" is null or "teacher_evaluations"."final_grade" between 0 and 20),
	CONSTRAINT "teacher_evaluations_grade_calculated" CHECK ("teacher_evaluations"."grade_fixed" or "teacher_evaluations"."final_grade" is not distinct from ("teacher_evaluations"."level_task" + "teacher_evaluations"."level_organization" + "teacher_evaluations"."level_vocabulary" + "teacher_evaluations"."level_grammar" + "teacher_evaluations"."level_mechanics")),
	CONSTRAINT "teacher_evaluations_fixed_grade_present" CHECK (not "teacher_evaluations"."grade_fixed" or "teacher_evaluations"."final_grade" is not null),
	CONSTRAINT "teacher_evaluations_revision_positive" CHECK ("teacher_evaluations"."revision" >= 1)
);
--> statement-breakpoint
ALTER TABLE "review_journal_entries" ADD CONSTRAINT "review_journal_entries_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_journal_entries" ADD CONSTRAINT "review_journal_entries_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_evaluations" ADD CONSTRAINT "teacher_evaluations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_evaluations" ADD CONSTRAINT "teacher_evaluations_submission_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_evaluations" ADD CONSTRAINT "teacher_evaluations_version_fk" FOREIGN KEY ("submission_id","version_number") REFERENCES "public"."submission_versions"("submission_id","number") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_evaluations" ADD CONSTRAINT "teacher_evaluations_proposal_fk" FOREIGN KEY ("proposal_id","submission_id","version_number") REFERENCES "public"."ai_proposals"("id","submission_id","version_number") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "review_journal_entries_submission_idx" ON "review_journal_entries" USING btree ("submission_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "review_journal_entries_assignment_idx" ON "review_journal_entries" USING btree ("assignment_id","created_at");