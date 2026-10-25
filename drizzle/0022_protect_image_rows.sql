-- E9 (spec 0011): what a constraint cannot hold on the image channel. TRUNCATE
-- (tests) is not concerned. Limit: deleting images at the end of review
-- (DON-01) will have to disable these triggers in its own procedure.

-- A page's position is unique in its draft and in its version, checked at the
-- commit: a reorder swaps positions in one transaction. Drizzle has no
-- deferrable unique, so these two live here and not in the schema.
ALTER TABLE "submission_pages" ADD CONSTRAINT "submission_pages_draft_position_unique" UNIQUE ("draft_id", "position") DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "submission_pages" ADD CONSTRAINT "submission_pages_version_position_unique" UNIQUE ("version_id", "position") DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint

-- A reading run is kept for good: only page_id may go from a page to null,
-- when that page is deleted (on delete set null). forbid_change would refuse
-- that update too.
CREATE FUNCTION "public"."reading_runs_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
	IF TG_OP = 'UPDATE' AND OLD.page_id IS NOT NULL AND NEW.page_id IS NULL
		AND (to_jsonb(NEW) - 'page_id') = (to_jsonb(OLD) - 'page_id') THEN
		RETURN NEW;
	END IF;
	RAISE EXCEPTION '% on reading_runs is forbidden: a reading run never changes', TG_OP
		USING ERRCODE = 'restrict_violation';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "reading_runs_guard" BEFORE UPDATE OR DELETE ON "public"."reading_runs"
	FOR EACH ROW EXECUTE FUNCTION "public"."reading_runs_guard"();--> statement-breakpoint

-- A page of a draft changes freely (reorder, retake, reading). The attach, in
-- one statement, takes it from its draft to its version once, bytes and
-- position kept. Attached, its bytes, position and version never change, and
-- its reading only from pending or failed to read (the pipeline reading an
-- unchecked version); it is never deleted.
CREATE FUNCTION "public"."submission_pages_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
	reading_fields text[] := ARRAY['reading_status', 'reading_text', 'has_writing', 'reading_run_id', 'read_at'];
BEGIN
	IF TG_OP = 'DELETE' THEN
		IF OLD.draft_id IS NOT NULL THEN
			RETURN OLD;
		END IF;
		RAISE EXCEPTION 'DELETE of an attached page is forbidden'
			USING ERRCODE = 'restrict_violation';
	END IF;
	IF OLD.draft_id IS NOT NULL THEN
		IF NEW.draft_id IS NOT NULL THEN
			RETURN NEW;
		END IF;
		IF OLD.version_id IS NULL AND NEW.version_id IS NOT NULL
			AND (to_jsonb(NEW) - ARRAY['draft_id', 'version_id']) = (to_jsonb(OLD) - ARRAY['draft_id', 'version_id']) THEN
			RETURN NEW;
		END IF;
		RAISE EXCEPTION 'A page leaves its draft only to be attached to a version, unchanged'
			USING ERRCODE = 'restrict_violation';
	END IF;
	IF (to_jsonb(NEW) - reading_fields) = (to_jsonb(OLD) - reading_fields)
		AND (
			(to_jsonb(NEW) - 'id') = (to_jsonb(OLD) - 'id')
			OR (OLD.reading_status IN ('pending', 'failed') AND NEW.reading_status = 'read')
		) THEN
		RETURN NEW;
	END IF;
	RAISE EXCEPTION 'An attached page never changes, but its reading from pending or failed to read'
		USING ERRCODE = 'restrict_violation';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "submission_pages_guard" BEFORE UPDATE OR DELETE ON "public"."submission_pages"
	FOR EACH ROW EXECUTE FUNCTION "public"."submission_pages_guard"();--> statement-breakpoint

-- A transcription is written once at confirmation; afterwards only its text,
-- from null, when the student did not check it (the pipeline's reading).
CREATE FUNCTION "public"."submission_transcriptions_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
	IF TG_OP = 'UPDATE' AND OLD.text IS NULL AND NEW.text IS NOT NULL AND NOT OLD.checked_by_student
		AND (to_jsonb(NEW) - 'text') = (to_jsonb(OLD) - 'text') THEN
		RETURN NEW;
	END IF;
	RAISE EXCEPTION '% on submission_transcriptions is forbidden: only an unchecked text, once, from null', TG_OP
		USING ERRCODE = 'restrict_violation';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "submission_transcriptions_guard" BEFORE UPDATE OR DELETE ON "public"."submission_transcriptions"
	FOR EACH ROW EXECUTE FUNCTION "public"."submission_transcriptions_guard"();--> statement-breakpoint

-- The student's word changes never change (forbid_change, 0011).
CREATE TRIGGER "transcription_changes_forbid_change" BEFORE UPDATE OR DELETE ON "public"."transcription_changes"
	FOR EACH ROW EXECUTE FUNCTION "public"."forbid_change"();
