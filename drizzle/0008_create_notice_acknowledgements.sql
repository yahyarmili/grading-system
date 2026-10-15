CREATE TYPE "public"."notice_kind" AS ENUM('student_submission');--> statement-breakpoint
CREATE TABLE "notice_acknowledgements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"notice" "notice_kind" NOT NULL,
	"version" smallint NOT NULL,
	"acknowledged_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notice_acknowledgements_user_notice_version_unique" UNIQUE("user_id","notice","version")
);
--> statement-breakpoint
ALTER TABLE "notice_acknowledgements" ADD CONSTRAINT "notice_acknowledgements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;