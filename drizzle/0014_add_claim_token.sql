ALTER TABLE "submissions" ADD COLUMN "claim_token" text;--> statement-breakpoint
-- A submission already evaluating (left by a process stopped before E6.2) gets a token no run holds: only the sweep frees it.
UPDATE "submissions" SET "claim_token" = 'legacy-' || "id" WHERE "status" = 'evaluating';--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_claim_token_iff_evaluating" CHECK (("submissions"."status" = 'evaluating') = ("submissions"."claim_token" is not null));
