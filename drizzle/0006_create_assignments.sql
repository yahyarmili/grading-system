CREATE TYPE "public"."assignment_language" AS ENUM('en', 'fr');--> statement-breakpoint
CREATE TYPE "public"."assignment_level" AS ENUM('A1', 'A2', 'B1', 'B2', 'C1');--> statement-breakpoint
CREATE TABLE "assignment_classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"teacher_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignment_classes_assignment_class_unique" UNIQUE("assignment_id","class_id")
);
--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" uuid NOT NULL,
	"title" text NOT NULL,
	"subject" text NOT NULL,
	"level" "assignment_level" NOT NULL,
	"language" "assignment_language" NOT NULL,
	"deadline" timestamp with time zone NOT NULL,
	"instructions" text,
	"content_version" integer DEFAULT 1 NOT NULL,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignments_id_teacher_unique" UNIQUE("id","teacher_id"),
	CONSTRAINT "assignments_title_trimmed" CHECK ("assignments"."title" = btrim("assignments"."title") and "assignments"."title" <> ''),
	CONSTRAINT "assignments_subject_trimmed" CHECK ("assignments"."subject" = btrim("assignments"."subject") and "assignments"."subject" <> ''),
	CONSTRAINT "assignments_instructions_trimmed" CHECK ("assignments"."instructions" is null or ("assignments"."instructions" = btrim("assignments"."instructions") and "assignments"."instructions" <> ''))
);
--> statement-breakpoint
-- Moved by hand before the foreign key that references it (generated last).
ALTER TABLE "classes" ADD CONSTRAINT "classes_id_teacher_unique" UNIQUE("id","teacher_id");--> statement-breakpoint
ALTER TABLE "assignment_classes" ADD CONSTRAINT "assignment_classes_assignment_fk" FOREIGN KEY ("assignment_id","teacher_id") REFERENCES "public"."assignments"("id","teacher_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_classes" ADD CONSTRAINT "assignment_classes_class_fk" FOREIGN KEY ("class_id","teacher_id") REFERENCES "public"."classes"("id","teacher_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assignment_classes_class_id_idx" ON "assignment_classes" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "assignments_teacher_deadline_idx" ON "assignments" USING btree ("teacher_id","deadline" DESC NULLS LAST);