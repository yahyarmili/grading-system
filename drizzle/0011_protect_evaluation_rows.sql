-- E5.5 (EVL-03 R2, NFR-QUA-02): an evaluation run and its AI proposal never
-- change and are never deleted; the text of a version that was evaluated
-- never changes either. A new evaluation is a new run. TRUNCATE (tests) is not
-- concerned. Limit: deleting a copy (DON-01) will have to disable these
-- triggers in its own procedure.
CREATE FUNCTION "public"."forbid_change"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION '% on % is forbidden: these rows never change', TG_OP, TG_TABLE_NAME
		USING ERRCODE = 'restrict_violation';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "evaluation_runs_forbid_change" BEFORE UPDATE OR DELETE ON "public"."evaluation_runs"
	FOR EACH ROW EXECUTE FUNCTION "public"."forbid_change"();--> statement-breakpoint
CREATE TRIGGER "ai_proposals_forbid_change" BEFORE UPDATE OR DELETE ON "public"."ai_proposals"
	FOR EACH ROW EXECUTE FUNCTION "public"."forbid_change"();--> statement-breakpoint
-- A version may still be deleted (an E4 test does), never rewritten.
CREATE TRIGGER "submission_versions_forbid_update" BEFORE UPDATE ON "public"."submission_versions"
	FOR EACH ROW EXECUTE FUNCTION "public"."forbid_change"();
