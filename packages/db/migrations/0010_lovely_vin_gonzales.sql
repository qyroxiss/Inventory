ALTER TABLE "companies" ADD COLUMN "qty_decimals" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "amount_decimals" integer DEFAULT 2 NOT NULL;