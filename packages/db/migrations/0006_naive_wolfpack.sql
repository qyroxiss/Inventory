CREATE TABLE "purchase_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"purchase_id" uuid NOT NULL,
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
CREATE TABLE "purchases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"book_id" uuid NOT NULL,
	"bill_no" text NOT NULL,
	"bill_date" date NOT NULL,
	"supp_code" text NOT NULL,
	"supp_inv_no" text,
	"supp_inv_date" text,
	"supply_with" text,
	"order_no" text,
	"order_date" text,
	"order_type" text,
	"goods_rec_no" text,
	"rec_date" text,
	"transporter" text,
	"narration" text,
	"is_inter_state" boolean DEFAULT false NOT NULL,
	"total_qty" numeric(14, 3) DEFAULT '0' NOT NULL,
	"sub_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"disc_amt" numeric(14, 2) DEFAULT '0' NOT NULL,
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
CREATE TABLE "stock_trn" (
	"id" uuid PRIMARY KEY NOT NULL,
	"book_id" uuid NOT NULL,
	"voucher_id" uuid,
	"vchr_type" text,
	"vchr_no" text,
	"trn_date" date NOT NULL,
	"part_code" text NOT NULL,
	"godown_code" text,
	"in_qty" numeric(14, 3) DEFAULT '0' NOT NULL,
	"out_qty" numeric(14, 3) DEFAULT '0' NOT NULL,
	"rate" numeric(14, 2) DEFAULT '0' NOT NULL,
	"value" numeric(14, 2) DEFAULT '0' NOT NULL,
	"remarks" text
);
--> statement-breakpoint
CREATE TABLE "voucher_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"voucher_id" uuid NOT NULL,
	"line_no" bigint NOT NULL,
	"part_code" text NOT NULL,
	"godown_code" text,
	"qty" numeric(14, 3) DEFAULT '0' NOT NULL,
	"unit" text,
	"rate" numeric(14, 2) DEFAULT '0' NOT NULL,
	"disc_pct" numeric(8, 2) DEFAULT '0' NOT NULL,
	"disc_amt" numeric(14, 2) DEFAULT '0' NOT NULL,
	"hsn_no" text,
	"gst_rate" numeric(8, 2) DEFAULT '0' NOT NULL,
	"cess_rate" numeric(8, 2) DEFAULT '0' NOT NULL,
	"taxable_amt" numeric(14, 2) DEFAULT '0' NOT NULL,
	"cgst_amt" numeric(14, 2) DEFAULT '0' NOT NULL,
	"sgst_amt" numeric(14, 2) DEFAULT '0' NOT NULL,
	"igst_amt" numeric(14, 2) DEFAULT '0' NOT NULL,
	"cess_amt" numeric(14, 2) DEFAULT '0' NOT NULL,
	"line_total" numeric(14, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_voucher_id_vouchers_id_fk" FOREIGN KEY ("voucher_id") REFERENCES "public"."vouchers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_trn" ADD CONSTRAINT "stock_trn_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_trn" ADD CONSTRAINT "stock_trn_voucher_id_vouchers_id_fk" FOREIGN KEY ("voucher_id") REFERENCES "public"."vouchers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voucher_items" ADD CONSTRAINT "voucher_items_voucher_id_vouchers_id_fk" FOREIGN KEY ("voucher_id") REFERENCES "public"."vouchers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_lines_purchase_line" ON "purchase_lines" USING btree ("purchase_id","line_no");--> statement-breakpoint
CREATE UNIQUE INDEX "purchases_book_bill" ON "purchases" USING btree ("book_id","bill_no");--> statement-breakpoint
CREATE INDEX "purchases_book_date" ON "purchases" USING btree ("book_id","bill_date");--> statement-breakpoint
CREATE INDEX "stock_trn_book_part" ON "stock_trn" USING btree ("book_id","part_code");--> statement-breakpoint
CREATE INDEX "stock_trn_voucher" ON "stock_trn" USING btree ("voucher_id");--> statement-breakpoint
CREATE INDEX "voucher_items_voucher" ON "voucher_items" USING btree ("voucher_id");