ALTER TABLE "scorm_attempt" ADD COLUMN "session_id" uuid;--> statement-breakpoint
ALTER TABLE "scorm_attempt" ADD COLUMN "session_time" double precision DEFAULT 0 NOT NULL;