-- E7.1 (REV-03, REV-04): the review log never changes and is never deleted;
-- the teacher's evaluation is never deleted, keeps its origin, and moves one
-- revision at a time; and no revision of it commits without its log entry
-- (checked at commit: the entries are written after the row, in the same
-- transaction, by src/server/data/review/record.ts). TRUNCATE (tests) is not
-- concerned. forbid_change() comes from 0011.
CREATE TRIGGER "review_journal_entries_forbid_change" BEFORE UPDATE OR DELETE ON "public"."review_journal_entries"
	FOR EACH ROW EXECUTE FUNCTION "public"."forbid_change"();--> statement-breakpoint
CREATE TRIGGER "teacher_evaluations_forbid_delete" BEFORE DELETE ON "public"."teacher_evaluations"
	FOR EACH ROW EXECUTE FUNCTION "public"."forbid_change"();--> statement-breakpoint
CREATE FUNCTION "public"."guard_teacher_evaluation"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
	IF NEW.submission_id IS DISTINCT FROM OLD.submission_id
		OR NEW.version_number IS DISTINCT FROM OLD.version_number
		OR NEW.origin IS DISTINCT FROM OLD.origin
		OR NEW.proposal_id IS DISTINCT FROM OLD.proposal_id
		OR NEW.rubric_version IS DISTINCT FROM OLD.rubric_version
		OR NEW.created_by IS DISTINCT FROM OLD.created_by
		OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
		RAISE EXCEPTION 'the origin of a teacher evaluation never changes'
			USING ERRCODE = 'restrict_violation';
	END IF;
	IF NEW.revision <> OLD.revision + 1 THEN
		RAISE EXCEPTION 'a teacher evaluation moves one revision at a time'
			USING ERRCODE = 'restrict_violation';
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "teacher_evaluations_guard" BEFORE UPDATE ON "public"."teacher_evaluations"
	FOR EACH ROW EXECUTE FUNCTION "public"."guard_teacher_evaluation"();--> statement-breakpoint
CREATE FUNCTION "public"."require_review_journal"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM "public"."review_journal_entries" e
		WHERE e.submission_id = NEW.submission_id AND e.evaluation_revision = NEW.revision
	) THEN
		RAISE EXCEPTION 'a teacher evaluation revision was written without its review log entry'
			USING ERRCODE = 'restrict_violation';
	END IF;
	RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "teacher_evaluations_require_journal" AFTER INSERT OR UPDATE ON "public"."teacher_evaluations"
	DEFERRABLE INITIALLY DEFERRED
	FOR EACH ROW EXECUTE FUNCTION "public"."require_review_journal"();
