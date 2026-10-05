ALTER TABLE "scorm_package" ADD COLUMN "max_attempts" integer;--> statement-breakpoint
-- A passing score now only applies to the "passed" rule, so activities that had one keep requiring it.
UPDATE "scorm_package" SET "completion_rule" = 'passed' WHERE "completion_min_score" IS NOT NULL;
