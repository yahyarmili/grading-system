CREATE TYPE "public"."page_reading_status" AS ENUM('pending', 'read', 'failed');--> statement-breakpoint
CREATE TYPE "public"."reading_outcome" AS ENUM('read', 'no_writing', 'failed');--> statement-breakpoint
ALTER TYPE "public"."not_assessable_cause" ADD VALUE 'no_writing';--> statement-breakpoint
CREATE TABLE "reading_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid,
	"draft_id" uuid,
	"student_id" uuid,
	"submission_id" uuid,
	"outcome" "reading_outcome" NOT NULL,
	"provider" "ai_provider" NOT NULL,
	"model_requested" text NOT NULL,
	"model_answered" text,
	"prompt_version" text NOT NULL,
	"attempts" smallint NOT NULL,
	"attempt_errors" "evaluation_error"[] DEFAULT '{}' NOT NULL,
	"duration_ms" integer NOT NULL,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reading_runs_draft_or_submission" CHECK (("reading_runs"."draft_id" is null) <> ("reading_runs"."submission_id" is null)),
	CONSTRAINT "reading_runs_draft_student" CHECK ("reading_runs"."draft_id" is null or "reading_runs"."student_id" is not null),
	CONSTRAINT "reading_runs_duration_not_negative" CHECK ("reading_runs"."duration_ms" >= 0),
	CONSTRAINT "reading_runs_attempts" CHECK ("reading_runs"."attempts" >= 1 and cardinality("reading_runs"."attempt_errors") = "reading_runs"."attempts" - (case when "reading_runs"."outcome" = 'failed' then 0 else 1 end))
);
--> statement-breakpoint
CREATE TABLE "submission_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submission_drafts_assignment_student_unique" UNIQUE("assignment_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "submission_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draft_id" uuid,
	"version_id" uuid,
	"mode" "submission_mode" DEFAULT 'images' NOT NULL,
	"position" smallint NOT NULL,
	"image" "bytea" NOT NULL,
	"byte_length" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"sha256" text NOT NULL,
	"upload_request_id" uuid NOT NULL,
	"reading_status" "page_reading_status" DEFAULT 'pending' NOT NULL,
	"reading_text" text,
	"has_writing" boolean,
	"reading_run_id" uuid,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submission_pages_draft_upload_unique" UNIQUE("draft_id","upload_request_id"),
	CONSTRAINT "submission_pages_mode_images" CHECK ("submission_pages"."mode" = 'images'),
	CONSTRAINT "submission_pages_draft_or_version" CHECK (("submission_pages"."draft_id" is null) <> ("submission_pages"."version_id" is null)),
	CONSTRAINT "submission_pages_position_positive" CHECK ("submission_pages"."position" >= 1),
	CONSTRAINT "submission_pages_byte_length" CHECK ("submission_pages"."byte_length" = octet_length("submission_pages"."image")),
	CONSTRAINT "submission_pages_size_positive" CHECK ("submission_pages"."width" >= 1 and "submission_pages"."height" >= 1),
	CONSTRAINT "submission_pages_read" CHECK (("submission_pages"."reading_status" = 'read') = ("submission_pages"."reading_text" is not null and "submission_pages"."has_writing" is not null and "submission_pages"."reading_run_id" is not null and "submission_pages"."read_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "submission_transcriptions" (
	"version_id" uuid PRIMARY KEY NOT NULL,
	"mode" "submission_mode" DEFAULT 'images' NOT NULL,
	"text" text,
	"checked_by_student" boolean NOT NULL,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submission_transcriptions_mode_images" CHECK ("submission_transcriptions"."mode" = 'images'),
	CONSTRAINT "submission_transcriptions_checked_text" CHECK (not "submission_transcriptions"."checked_by_student" or "submission_transcriptions"."text" is not null)
);
--> statement-breakpoint
CREATE TABLE "transcription_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"page_id" uuid NOT NULL,
	"word_index" integer NOT NULL,
	"engine_word" text NOT NULL,
	"student_word" text NOT NULL,
	CONSTRAINT "transcription_changes_page_word_unique" UNIQUE("page_id","word_index"),
	CONSTRAINT "transcription_changes_word_index" CHECK ("transcription_changes"."word_index" >= 0),
	CONSTRAINT "transcription_changes_engine_word" CHECK ("transcription_changes"."engine_word" ~ '^\S+$'),
	CONSTRAINT "transcription_changes_student_word" CHECK ("transcription_changes"."student_word" <> '' and "transcription_changes"."student_word" !~ '[\r\n]')
);
--> statement-breakpoint
ALTER TABLE "submissions" DROP CONSTRAINT "submissions_claim_token_iff_evaluating";--> statement-breakpoint
ALTER TABLE "reading_runs" ADD CONSTRAINT "reading_runs_page_id_submission_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."submission_pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_drafts" ADD CONSTRAINT "submission_drafts_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_drafts" ADD CONSTRAINT "submission_drafts_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_pages" ADD CONSTRAINT "submission_pages_draft_id_submission_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."submission_drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_pages" ADD CONSTRAINT "submission_pages_reading_run_id_reading_runs_id_fk" FOREIGN KEY ("reading_run_id") REFERENCES "public"."reading_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_pages" ADD CONSTRAINT "submission_pages_version_fk" FOREIGN KEY ("version_id","mode") REFERENCES "public"."submission_versions"("id","mode") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_transcriptions" ADD CONSTRAINT "submission_transcriptions_version_fk" FOREIGN KEY ("version_id","mode") REFERENCES "public"."submission_versions"("id","mode") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcription_changes" ADD CONSTRAINT "transcription_changes_version_id_submission_transcriptions_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."submission_transcriptions"("version_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcription_changes" ADD CONSTRAINT "transcription_changes_page_id_submission_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."submission_pages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reading_runs_draft_id_idx" ON "reading_runs" USING btree ("draft_id");--> statement-breakpoint
CREATE INDEX "reading_runs_student_created_idx" ON "reading_runs" USING btree ("student_id","created_at");--> statement-breakpoint
CREATE INDEX "reading_runs_submission_id_idx" ON "reading_runs" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "submission_pages_version_id_idx" ON "submission_pages" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "transcription_changes_version_id_idx" ON "transcription_changes" USING btree ("version_id");--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_claim_token_iff_evaluating" CHECK (("submissions"."status" in ('evaluating', 'transcribing')) = ("submissions"."claim_token" is not null));