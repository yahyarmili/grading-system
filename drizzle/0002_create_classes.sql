CREATE TYPE "public"."membership_status" AS ENUM('active', 'removed');--> statement-breakpoint
CREATE TABLE "class_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"status" "membership_status" DEFAULT 'active' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_memberships_removed_at" CHECK (("class_memberships"."status" = 'removed') = ("class_memberships"."removed_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" uuid NOT NULL,
	"name" text NOT NULL,
	"invite_nonce" text NOT NULL,
	"invite_link_digest" text NOT NULL,
	"invite_code_digest" text NOT NULL,
	"invite_issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"invite_disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "classes_invite_link_digest_unique" UNIQUE("invite_link_digest"),
	CONSTRAINT "classes_invite_code_digest_unique" UNIQUE("invite_code_digest"),
	CONSTRAINT "classes_name_trimmed" CHECK ("classes"."name" = btrim("classes"."name") and "classes"."name" <> '')
);
--> statement-breakpoint
ALTER TABLE "class_memberships" ADD CONSTRAINT "class_memberships_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_memberships" ADD CONSTRAINT "class_memberships_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "class_memberships_class_student_idx" ON "class_memberships" USING btree ("class_id","student_id");--> statement-breakpoint
CREATE INDEX "class_memberships_student_id_idx" ON "class_memberships" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "classes_teacher_name_idx" ON "classes" USING btree ("teacher_id",lower("name"));