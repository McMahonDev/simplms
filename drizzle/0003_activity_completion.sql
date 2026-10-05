CREATE TYPE "public"."completion_rule" AS ENUM('viewed', 'completed', 'passed');--> statement-breakpoint
CREATE TABLE "activity_prerequisite" (
	"package_id" uuid NOT NULL,
	"required_package_id" uuid NOT NULL,
	CONSTRAINT "activity_prerequisite_package_id_required_package_id_pk" PRIMARY KEY("package_id","required_package_id")
);
--> statement-breakpoint
ALTER TABLE "scorm_package" ADD COLUMN "completion_rule" "completion_rule" DEFAULT 'completed' NOT NULL;--> statement-breakpoint
ALTER TABLE "scorm_package" ADD COLUMN "completion_min_score" double precision;--> statement-breakpoint
ALTER TABLE "activity_prerequisite" ADD CONSTRAINT "activity_prerequisite_package_id_scorm_package_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."scorm_package"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_prerequisite" ADD CONSTRAINT "activity_prerequisite_required_package_id_scorm_package_id_fk" FOREIGN KEY ("required_package_id") REFERENCES "public"."scorm_package"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_prerequisite_required_package_id_index" ON "activity_prerequisite" USING btree ("required_package_id");