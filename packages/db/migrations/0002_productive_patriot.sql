CREATE TABLE "ledgers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"book_id" uuid NOT NULL,
	"acc_code" text NOT NULL,
	"acc_name" text NOT NULL,
	"grp_code" text NOT NULL,
	"op_bal" numeric(14, 2) DEFAULT '0' NOT NULL,
	"dr_cr" text DEFAULT 'Dr' NOT NULL,
	"add1" text,
	"add2" text,
	"city" text,
	"state" text,
	"state_code" text,
	"pin_code" text,
	"phone" text,
	"mobile" text,
	"email" text,
	"gstin" text,
	"pan" text,
	"credit_days" bigint DEFAULT 0 NOT NULL,
	"credit_limit" numeric(14, 2) DEFAULT '0' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "misc_list" (
	"id" uuid PRIMARY KEY NOT NULL,
	"book_id" uuid NOT NULL,
	"misc_code" text NOT NULL,
	"misc_name" text NOT NULL,
	"misc_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ledgers" ADD CONSTRAINT "ledgers_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "misc_list" ADD CONSTRAINT "misc_list_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ledgers_book_code" ON "ledgers" USING btree ("book_id","acc_code");--> statement-breakpoint
CREATE UNIQUE INDEX "ledgers_book_name" ON "ledgers" USING btree ("book_id","acc_name");--> statement-breakpoint
CREATE UNIQUE INDEX "misc_list_book_code" ON "misc_list" USING btree ("book_id","misc_code");--> statement-breakpoint
CREATE INDEX "misc_list_book_type_name" ON "misc_list" USING btree ("book_id","misc_type","misc_name");