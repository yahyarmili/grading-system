-- E8 (REV-05, PUB-01): what is validated or published is exactly what the
-- teacher validated, and complete.
-- 1. The teacher's evaluation is written only while its submission is To
--    review: a Validated or Published copy is changed only after transition
--    10 sent it back (Q8, copy.ts#editLocked), in the same transaction. So the
--    published result is the validated one, with no snapshot. The two guards
--    of 0017 and 0018 read the submission row once, under a share lock: the
--    code holds its FOR UPDATE already (lockCopy), so they wait for nothing;
--    two raw sessions writing without that lock first may deadlock, and
--    PostgreSQL then cancels one.
CREATE OR REPLACE FUNCTION "public"."guard_teacher_evaluation_birth"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
	ready boolean;
	open boolean;
BEGIN
	SELECT s.teacher_started_at IS NOT NULL AND s.current_version = NEW.version_number, s.status = 'to_review'
	INTO ready, open
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
	IF open IS NOT TRUE THEN
		RAISE EXCEPTION 'a teacher evaluation is written only while its submission is to review'
			USING ERRCODE = 'restrict_violation';
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION "public"."guard_teacher_evaluation"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
	open boolean;
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
	SELECT s.status = 'to_review' INTO open
	FROM "public"."submissions" s
	WHERE s.id = NEW.submission_id
	FOR SHARE;
	IF open IS NOT TRUE THEN
		RAISE EXCEPTION 'a teacher evaluation is written only while its submission is to review'
			USING ERRCODE = 'restrict_violation';
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint
-- 2. At commit, a Validated or Published submission has the teacher's
--    evaluation of its active version, with the five levels and a grade
--    (REV-05 R2 and CA2). The row is read again at commit, not taken from
--    NEW: several transitions may follow one another in one transaction (a
--    change of a validated copy, then its validation again).
CREATE FUNCTION "public"."require_complete_evaluation"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM "public"."submissions" s
		WHERE s.id = NEW.id
			AND s.status IN ('validated', 'published')
			AND NOT EXISTS (
				SELECT 1 FROM "public"."teacher_evaluations" e
				WHERE e.submission_id = s.id
					AND e.version_number = s.current_version
					AND e.level_task IS NOT NULL
					AND e.level_organization IS NOT NULL
					AND e.level_vocabulary IS NOT NULL
					AND e.level_grammar IS NOT NULL
					AND e.level_mechanics IS NOT NULL
					AND e.final_grade IS NOT NULL
			)
	) THEN
		RAISE EXCEPTION 'a validated or published submission needs a complete teacher evaluation'
			USING ERRCODE = 'restrict_violation';
	END IF;
	RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "submissions_require_complete_evaluation" AFTER UPDATE OF "status" ON "public"."submissions"
	DEFERRABLE INITIALLY DEFERRED
	FOR EACH ROW EXECUTE FUNCTION "public"."require_complete_evaluation"();--> statement-breakpoint
-- No submission was validated or published before E8 (no code applied
-- transitions 8 to 10); checked, since the triggers guard new writes only.
DO $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM "public"."submissions" s
		WHERE s.status IN ('validated', 'published')
			AND NOT EXISTS (
				SELECT 1 FROM "public"."teacher_evaluations" e
				WHERE e.submission_id = s.id AND e.version_number = s.current_version
					AND e.level_task IS NOT NULL AND e.level_organization IS NOT NULL AND e.level_vocabulary IS NOT NULL
					AND e.level_grammar IS NOT NULL AND e.level_mechanics IS NOT NULL AND e.final_grade IS NOT NULL
			)
	) THEN
		RAISE EXCEPTION 'a validated or published submission has no complete teacher evaluation';
	END IF;
END;
$$;
