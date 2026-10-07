CREATE TABLE "sale_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"sale_id" uuid NOT NULL,
	"line_no" bigint NOT NULL,
	"item_code" text NOT NULL,
	"item_name" text,
	"hsn_no" text,
	"unit" text,
	"location" text,
	"qty" numeric(14, 3) DEFAULT '0' NOT NULL,
	"rate" numeric(14, 2) DEFAULT '0' NOT NULL,
	"dis_p" numeric(8, 2) DEFAULT '0' NOT NULL,
	"dis_a" numeric(14, 2) DEFAULT '0' NOT NULL,
	"amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"sgst_p" numeric(8, 2) DEFAULT '0' NOT NULL,
	"sgst_a" numeric(14, 2) DEFAULT '0' NOT NULL,
	"cgst_p" numeric(8, 2) DEFAULT '0' NOT NULL,
	"cgst_a" numeric(14, 2) DEFAULT '0' NOT NULL,
	"igst_p" numeric(8, 2) DEFAULT '0' NOT NULL,
	"igst_a" numeric(14, 2) DEFAULT '0' NOT NULL,
	"line_total" numeric(14, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" uuid PRIMARY KEY NOT NULL,
	"book_id" uuid NOT NULL,
	"bill_no" text NOT NULL,
	"bill_date" date NOT NULL,
	"sale_type" text,
	"pay_mode" text DEFAULT 'Cash' NOT NULL,
	"cust_code" text,
	"cust_name" text,
	"address" text,
	"area" text,
	"city" text,
	"state" text,
	"state_code" text,
	"mobile" text,
	"gst_no" text,
	"location" text,
	"narration" text,
	"is_inter_state" boolean DEFAULT false NOT NULL,
	"total_qty" numeric(14, 3) DEFAULT '0' NOT NULL,
	"sub_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"item_disc_amt" numeric(14, 2) DEFAULT '0' NOT NULL,
	"bill_disc_pct" numeric(8, 2) DEFAULT '0' NOT NULL,
	"bill_disc_amt" numeric(14, 2) DEFAULT '0' NOT NULL,
	"sgst_amt" numeric(14, 2) DEFAULT '0' NOT NULL,
	"cgst_amt" numeric(14, 2) DEFAULT '0' NOT NULL,
	"igst_amt" numeric(14, 2) DEFAULT '0' NOT NULL,
	"round_off" numeric(14, 2) DEFAULT '0' NOT NULL,
	"net_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"voucher_id" uuid,
	"status" text DEFAULT 'Active' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"modified_by" text,
	"modified_at" timestamp with time zone,
	"cancelled_by" text,
	"cancelled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "stock_journal_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"voucher_id" uuid NOT NULL,
	"line_no" bigint NOT NULL,
	"side" text NOT NULL,
	"item_code" text NOT NULL,
	"item_name" text,
	"unit" text,
	"godown" text,
	"qty" numeric(14, 3) DEFAULT '0' NOT NULL,
	"rate" numeric(14, 2) DEFAULT '0' NOT NULL,
	"amount" numeric(14, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_voucher_id_vouchers_id_fk" FOREIGN KEY ("voucher_id") REFERENCES "public"."vouchers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_journal_lines" ADD CONSTRAINT "stock_journal_lines_voucher_id_vouchers_id_fk" FOREIGN KEY ("voucher_id") REFERENCES "public"."vouchers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sale_lines_sale_line" ON "sale_lines" USING btree ("sale_id","line_no");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_book_bill" ON "sales" USING btree ("book_id","bill_no");--> statement-breakpoint
CREATE INDEX "sales_book_date" ON "sales" USING btree ("book_id","bill_date");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_journal_lines_voucher_line" ON "stock_journal_lines" USING btree ("voucher_id","line_no");