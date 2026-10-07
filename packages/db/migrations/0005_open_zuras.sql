CREATE TABLE "bill_refs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"voucher_id" uuid NOT NULL,
	"acc_code" text NOT NULL,
	"bill_no" text NOT NULL,
	"ref_type" text DEFAULT 'New' NOT NULL,
	"bill_date" text,
	"due_date" text,
	"amount" numeric(14, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voucher_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"voucher_id" uuid NOT NULL,
	"line_no" bigint NOT NULL,
	"acc_code" text NOT NULL,
	"dr_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"cr_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"narration" text
);
--> statement-breakpoint
CREATE TABLE "voucher_series" (
	"id" uuid PRIMARY KEY NOT NULL,
	"book_id" uuid NOT NULL,
	"vchr_type" text NOT NULL,
	"vchr_name" text,
	"prefix" text,
	"width" bigint DEFAULT 3 NOT NULL,
	"last_no" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vouchers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"book_id" uuid NOT NULL,
	"vchr_no" text NOT NULL,
	"vchr_type" text NOT NULL,
	"vchr_date" date NOT NULL,
	"party_code" text,
	"ref_no" text,
	"ref_date" text,
	"narration" text,
	"place_of_supply" text,
	"taxable_amt" numeric(14, 2) DEFAULT '0' NOT NULL,
	"cgst_amt" numeric(14, 2) DEFAULT '0' NOT NULL,
	"sgst_amt" numeric(14, 2) DEFAULT '0' NOT NULL,
	"igst_amt" numeric(14, 2) DEFAULT '0' NOT NULL,
	"cess_amt" numeric(14, 2) DEFAULT '0' NOT NULL,
	"other_chrg" numeric(14, 2) DEFAULT '0' NOT NULL,
	"round_off" numeric(14, 2) DEFAULT '0' NOT NULL,
	"net_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'Active' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"modified_by" text,
	"modified_at" timestamp with time zone,
	"cancelled_by" text,
	"cancelled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "bill_refs" ADD CONSTRAINT "bill_refs_voucher_id_vouchers_id_fk" FOREIGN KEY ("voucher_id") REFERENCES "public"."vouchers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voucher_lines" ADD CONSTRAINT "voucher_lines_voucher_id_vouchers_id_fk" FOREIGN KEY ("voucher_id") REFERENCES "public"."vouchers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voucher_series" ADD CONSTRAINT "voucher_series_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bill_refs_voucher" ON "bill_refs" USING btree ("voucher_id");--> statement-breakpoint
CREATE INDEX "voucher_lines_voucher" ON "voucher_lines" USING btree ("voucher_id");--> statement-breakpoint
CREATE INDEX "voucher_lines_acc" ON "voucher_lines" USING btree ("acc_code");--> statement-breakpoint
CREATE UNIQUE INDEX "voucher_series_book_type" ON "voucher_series" USING btree ("book_id","vchr_type");--> statement-breakpoint
CREATE UNIQUE INDEX "vouchers_book_type_no" ON "vouchers" USING btree ("book_id","vchr_type","vchr_no");--> statement-breakpoint
CREATE INDEX "vouchers_book_date" ON "vouchers" USING btree ("book_id","vchr_date");