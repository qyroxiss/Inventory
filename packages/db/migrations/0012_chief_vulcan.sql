CREATE TABLE "return_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"return_id" uuid NOT NULL,
	"line_no" bigint NOT NULL,
	"src_line_no" bigint NOT NULL,
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
CREATE TABLE "returns" (
	"id" uuid PRIMARY KEY NOT NULL,
	"book_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"return_no" text NOT NULL,
	"return_date" date NOT NULL,
	"against_bill_no" text NOT NULL,
	"against_bill_date" date,
	"party_code" text,
	"party_name" text,
	"state" text,
	"is_inter_state" boolean DEFAULT false NOT NULL,
	"narration" text,
	"total_qty" numeric(14, 3) DEFAULT '0' NOT NULL,
	"sub_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"sgst_amt" numeric(14, 2) DEFAULT '0' NOT NULL,
	"cgst_amt" numeric(14, 2) DEFAULT '0' NOT NULL,
	"igst_amt" numeric(14, 2) DEFAULT '0' NOT NULL,
	"bill_disc" numeric(14, 2) DEFAULT '0' NOT NULL,
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
ALTER TABLE "return_lines" ADD CONSTRAINT "return_lines_return_id_returns_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."returns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_voucher_id_vouchers_id_fk" FOREIGN KEY ("voucher_id") REFERENCES "public"."vouchers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "return_lines_return_line" ON "return_lines" USING btree ("return_id","line_no");--> statement-breakpoint
CREATE UNIQUE INDEX "returns_book_kind_no" ON "returns" USING btree ("book_id","kind","return_no");--> statement-breakpoint
CREATE INDEX "returns_book_bill" ON "returns" USING btree ("book_id","kind","against_bill_no");