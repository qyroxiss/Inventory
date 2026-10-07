CREATE TABLE "stock_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"book_id" uuid NOT NULL,
	"part_code" text NOT NULL,
	"part_name" text NOT NULL,
	"print_name" text,
	"sub_grp_code" text,
	"unit" text,
	"alt_unit" text,
	"conv_factor" numeric(14, 4) DEFAULT '0' NOT NULL,
	"reg_type" text,
	"gst_rate" text,
	"cess_rate" numeric(8, 2) DEFAULT '0' NOT NULL,
	"hsn_no" text,
	"pur_rate" numeric(14, 2) DEFAULT '0' NOT NULL,
	"sale_rate" numeric(14, 2) DEFAULT '0' NOT NULL,
	"mrp" numeric(14, 2) DEFAULT '0' NOT NULL,
	"op_qty" numeric(14, 3) DEFAULT '0' NOT NULL,
	"op_value" numeric(14, 2) DEFAULT '0' NOT NULL,
	"reorder_level" numeric(14, 3) DEFAULT '0' NOT NULL,
	"min_level" numeric(14, 3) DEFAULT '0' NOT NULL,
	"max_level" numeric(14, 3) DEFAULT '0' NOT NULL,
	"barcode" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stock_items_book_code" ON "stock_items" USING btree ("book_id","part_code");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_items_book_name" ON "stock_items" USING btree ("book_id","part_name");