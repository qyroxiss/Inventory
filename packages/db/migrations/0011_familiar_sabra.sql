ALTER TABLE "companies" ADD COLUMN "item_entry" text DEFAULT 'name' NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "paper_size" text DEFAULT 'A4' NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "paper_orientation" text DEFAULT 'portrait' NOT NULL;