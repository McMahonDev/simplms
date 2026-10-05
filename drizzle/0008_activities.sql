-- Generalizes SCORM packages into activities (issue #36). Hand-written as renames so existing
-- activities, attempts, prerequisites, and grants keep their ids and data; drizzle-kit would
-- have dropped and recreated the tables. Constraint and index names match drizzle's naming so
-- later generated migrations diff cleanly.

CREATE TYPE "public"."activity_type" AS ENUM('scorm', 'page', 'link', 'pdf', 'video', 'quiz');--> statement-breakpoint

-- Activities: the old scorm_package table, renamed, with a type and settings.
ALTER TABLE "scorm_package" RENAME TO "activity";--> statement-breakpoint
ALTER TABLE "activity" RENAME CONSTRAINT "scorm_package_pkey" TO "activity_pkey";--> statement-breakpoint
ALTER TABLE "activity" RENAME CONSTRAINT "scorm_package_course_id_course_id_fk" TO "activity_course_id_course_id_fk";--> statement-breakpoint
ALTER INDEX "scorm_package_course_id_index" RENAME TO "activity_course_id_index";--> statement-breakpoint
ALTER TABLE "activity" ADD COLUMN "type" "activity_type" DEFAULT 'scorm' NOT NULL;--> statement-breakpoint
ALTER TABLE "activity" ALTER COLUMN "type" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "activity" ADD COLUMN "settings" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint

-- SCORM details move to their own table, keyed by activity.
CREATE TABLE "scorm_package" (
	"activity_id" uuid PRIMARY KEY NOT NULL,
	"version" "scorm_version" NOT NULL,
	"entry_href" text NOT NULL,
	"storage_key" text NOT NULL,
	"manifest_json" jsonb NOT NULL
);
--> statement-breakpoint
INSERT INTO "scorm_package" ("activity_id", "version", "entry_href", "storage_key", "manifest_json")
	SELECT "id", "version", "entry_href", "storage_key", "manifest_json" FROM "activity";--> statement-breakpoint
ALTER TABLE "scorm_package" ADD CONSTRAINT "scorm_package_activity_id_activity_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" DROP COLUMN "version";--> statement-breakpoint
ALTER TABLE "activity" DROP COLUMN "entry_href";--> statement-breakpoint
ALTER TABLE "activity" DROP COLUMN "storage_key";--> statement-breakpoint
ALTER TABLE "activity" DROP COLUMN "manifest_json";--> statement-breakpoint

-- Attempts.
ALTER TABLE "scorm_attempt" RENAME TO "activity_attempt";--> statement-breakpoint
ALTER TABLE "activity_attempt" RENAME COLUMN "package_id" TO "activity_id";--> statement-breakpoint
ALTER TABLE "activity_attempt" RENAME COLUMN "cmi_json" TO "data";--> statement-breakpoint
ALTER TABLE "activity_attempt" RENAME CONSTRAINT "scorm_attempt_pkey" TO "activity_attempt_pkey";--> statement-breakpoint
ALTER TABLE "activity_attempt" RENAME CONSTRAINT "scorm_attempt_pkg_user_num_uq" TO "activity_attempt_activity_user_num_uq";--> statement-breakpoint
ALTER TABLE "activity_attempt" RENAME CONSTRAINT "scorm_attempt_package_id_scorm_package_id_fk" TO "activity_attempt_activity_id_activity_id_fk";--> statement-breakpoint
ALTER TABLE "activity_attempt" RENAME CONSTRAINT "scorm_attempt_user_id_user_id_fk" TO "activity_attempt_user_id_user_id_fk";--> statement-breakpoint
ALTER INDEX "scorm_attempt_user_id_index" RENAME TO "activity_attempt_user_id_index";--> statement-breakpoint

-- Prerequisites.
ALTER TABLE "activity_prerequisite" RENAME COLUMN "package_id" TO "activity_id";--> statement-breakpoint
ALTER TABLE "activity_prerequisite" RENAME COLUMN "required_package_id" TO "required_activity_id";--> statement-breakpoint
ALTER TABLE "activity_prerequisite" RENAME CONSTRAINT "activity_prerequisite_package_id_required_package_id_pk" TO "activity_prerequisite_activity_id_required_activity_id_pk";--> statement-breakpoint
ALTER TABLE "activity_prerequisite" RENAME CONSTRAINT "activity_prerequisite_package_id_scorm_package_id_fk" TO "activity_prerequisite_activity_id_activity_id_fk";--> statement-breakpoint
ALTER TABLE "activity_prerequisite" RENAME CONSTRAINT "activity_prerequisite_required_package_id_scorm_package_id_fk" TO "activity_prerequisite_required_activity_id_activity_id_fk";--> statement-breakpoint
ALTER INDEX "activity_prerequisite_required_package_id_index" RENAME TO "activity_prerequisite_required_activity_id_index";--> statement-breakpoint

-- Attempt grants.
ALTER TABLE "attempt_grant" RENAME COLUMN "package_id" TO "activity_id";--> statement-breakpoint
ALTER TABLE "attempt_grant" RENAME CONSTRAINT "attempt_grant_package_id_user_id_pk" TO "attempt_grant_activity_id_user_id_pk";--> statement-breakpoint
ALTER TABLE "attempt_grant" RENAME CONSTRAINT "attempt_grant_package_id_scorm_package_id_fk" TO "attempt_grant_activity_id_activity_id_fk";
