CREATE TABLE "notification_preference" (
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"email" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preference_user_id_type_pk" PRIMARY KEY("user_id","type")
);
--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "email_status" text;--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "email_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "email_retry_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "emailed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "email_error" text;--> statement-breakpoint
ALTER TABLE "notification_preference" ADD CONSTRAINT "notification_preference_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_email_pending_idx" ON "notification" USING btree ("created_at") WHERE "notification"."email_status" is null;--> statement-breakpoint
-- Notifications that existed before email delivery are never emailed.
UPDATE "notification" SET "email_status" = 'skipped' WHERE "email_status" IS NULL;
