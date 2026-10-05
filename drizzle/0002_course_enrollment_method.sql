CREATE TYPE "public"."enrollment_method" AS ENUM('manual', 'open', 'key');--> statement-breakpoint
ALTER TABLE "course" ADD COLUMN "enrollment_method" "enrollment_method" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "course" ADD COLUMN "enrollment_key" text;