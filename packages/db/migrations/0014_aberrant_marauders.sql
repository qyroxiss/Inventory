ALTER TABLE "auth_user" ADD COLUMN "blocked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_user" ADD COLUMN "valid_till" date;