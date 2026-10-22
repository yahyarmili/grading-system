-- Review of E7: the database checks what the review log and the teacher's
-- evaluation mean, not only that they exist.
-- 1. A revision marks a write (evaluation_created, evaluation_changed), and a
--    write only: no other entry can stand for a revision's log entry. The
--    entries written so far pass: only record.ts#writeEvaluation sets a
--    revision, on those two events; list_opened, copy_opened,
--    retry_requested, relaunch_requested and retry_abandoned never do.
ALTER TABLE "review_journal_entries" DROP CONSTRAINT "review_journal_entries_revision_of_writes";--> statement-breakpoint
ALTER TABLE "review_journal_entries" ADD CONSTRAINT "review_journal_entries_revision_of_writes" CHECK (("review_journal_entries"."event" in ('evaluation_created', 'evaluation_changed')) = ("review_journal_entries"."evaluation_revision" is not null));--> statement-breakpoint
-- 2. At commit (0017), a new evaluation needs its evaluation_created entry and
--    each later revision an evaluation_changed entry, of the same revision and
--    version (record.ts writes them so).
CREATE OR REPLACE FUNCTION "public"."require_review_journal"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM "public"."review_journal_entries" e
		WHERE e.submission_id = NEW.submission_id
			AND e.evaluation_revision = NEW.revision
			AND e.version_number = NEW.version_number
			AND e.event = (CASE TG_OP WHEN 'INSERT' THEN 'evaluation_created' ELSE 'evaluation_changed' END)::"public"."review_event"
	) THEN
		RAISE EXCEPTION 'a teacher evaluation revision was written without its review log entry'
			USING ERRCODE = 'restrict_violation';
	END IF;
	RETURN NULL;
END;
$$;--> statement-breakpoint
-- 3. An evaluation is born at revision 1, on a submission the teacher started
--    (teacher_started_at, set before the insert by record.ts, in the same
--    transaction), on its active version. The submission row is read under a
--    share lock: a replacement in progress is waited for, then seen.
CREATE FUNCTION "public"."guard_teacher_evaluation_birth"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
	ready boolean;
BEGIN
	SELECT s.teacher_started_at IS NOT NULL AND s.current_version = NEW.version_number INTO ready
	FROM "public"."submissions" s
	WHERE s.id = NEW.submission_id
	FOR SHARE;
	IF ready IS NOT TRUE THEN
		RAISE EXCEPTION 'a teacher evaluation is written only on a started submission, on its active version'
			USING ERRCODE = 'restrict_violation';
	END IF;
	IF NEW.revision <> 1 THEN
		RAISE EXCEPTION 'a teacher evaluation is born at revision 1'
			USING ERRCODE = 'restrict_violation';
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "teacher_evaluations_guard_birth" BEFORE INSERT ON "public"."teacher_evaluations"
	FOR EACH ROW EXECUTE FUNCTION "public"."guard_teacher_evaluation_birth"();--> statement-breakpoint
-- 4. Once an evaluation exists, its submission keeps its version and stays
--    started: the evaluation, joined by submission_id, always concerns the
--    active version (SUB-05 R3).
CREATE FUNCTION "public"."freeze_reviewed_submission"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
	IF (NEW.current_version IS DISTINCT FROM OLD.current_version
		OR (OLD.teacher_started_at IS NOT NULL AND NEW.teacher_started_at IS NULL))
		AND EXISTS (SELECT 1 FROM "public"."teacher_evaluations" e WHERE e.submission_id = OLD.id) THEN
		RAISE EXCEPTION 'a submission with a teacher evaluation keeps its version and stays started'
			USING ERRCODE = 'restrict_violation';
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "submissions_freeze_reviewed" BEFORE UPDATE OF "current_version", "teacher_started_at" ON "public"."submissions"
	FOR EACH ROW EXECUTE FUNCTION "public"."freeze_reviewed_submission"();--> statement-breakpoint
-- The rows written so far already hold 3 and 4 (record.ts sets
-- teacher_started_at on the active version before the insert, and a
-- replacement needs teacher_started_at null); checked, since the triggers
-- guard new writes only.
DO $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM "public"."teacher_evaluations" e
		JOIN "public"."submissions" s ON s.id = e.submission_id
		WHERE s.teacher_started_at IS NULL OR s.current_version <> e.version_number
	) THEN
		RAISE EXCEPTION 'a teacher evaluation does not concern its submission''s active, started version';
	END IF;
END;
$$;
