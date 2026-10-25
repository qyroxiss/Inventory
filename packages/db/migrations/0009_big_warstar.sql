ALTER TABLE "purchase_lines" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "freight" numeric(14, 2) DEFAULT '0' NOT NULL;