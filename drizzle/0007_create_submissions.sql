CREATE TYPE "public"."submission_mode" AS ENUM('text', 'images');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('received', 'transcribing', 'transcription_failed', 'evaluating', 'evaluation_failed', 'not_assessable', 'to_review', 'validated', 'published');--> statement-breakpoint
CREATE TABLE "submission_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"number" smallint NOT NULL,
	"mode" "submission_mode" NOT NULL,
	"text" text,
	"request_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submission_versions_submission_number_unique" UNIQUE("submission_id","number"),
	CONSTRAINT "submission_versions_submission_request_unique" UNIQUE("submission_id","request_id"),
	CONSTRAINT "submission_versions_id_mode_unique" UNIQUE("id","mode"),
	CONSTRAINT "submission_versions_number_positive" CHECK ("submission_versions"."number" >= 1),
	CONSTRAINT "submission_versions_text_iff_mode" CHECK (("submission_versions"."mode" = 'text') = ("submission_versions"."text" is not null)),
	CONSTRAINT "submission_versions_text_not_empty" CHECK ("submission_versions"."text" <> '')
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"teacher_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"status" "submission_status" DEFAULT 'received' NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"late" boolean NOT NULL,
	"content_version" integer NOT NULL,
	"current_version" smallint DEFAULT 1 NOT NULL,
	"teacher_started_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submissions_assignment_student_unique" UNIQUE("assignment_id","student_id"),
	CONSTRAINT "submissions_current_version_positive" CHECK ("submissions"."current_version" >= 1),
	CONSTRAINT "submissions_content_version_positive" CHECK ("submissions"."content_version" >= 1),
	CONSTRAINT "submissions_validated_started" CHECK ("submissions"."status" not in ('validated', 'published') or "submissions"."teacher_started_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "submission_versions" ADD CONSTRAINT "submission_versions_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_assignment_fk" FOREIGN KEY ("assignment_id","teacher_id") REFERENCES "public"."assignments"("id","teacher_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "submissions_assignment_status_idx" ON "submissions" USING btree ("assignment_id","status");--> statement-breakpoint
CREATE INDEX "submissions_student_id_idx" ON "submissions" USING btree ("student_id");