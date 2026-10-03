CREATE TABLE "account_groups" (
	"id" uuid PRIMARY KEY NOT NULL,
	"book_id" uuid NOT NULL,
	"grp_code" text NOT NULL,
	"grp_name" text NOT NULL,
	"grp_type" text NOT NULL,
	"parent_grp" text NOT NULL,
	"is_ledger" text DEFAULT 'No' NOT NULL,
	"sort_order" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_groups" ADD CONSTRAINT "account_groups_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_groups_book_code" ON "account_groups" USING btree ("book_id","grp_code");--> statement-breakpoint
CREATE UNIQUE INDEX "account_groups_book_name" ON "account_groups" USING btree ("book_id","grp_name");