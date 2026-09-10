CREATE TABLE "customer_addresses" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"label" text,
	"full_name" text NOT NULL,
	"phone" text NOT NULL,
	"line1" text NOT NULL,
	"line2" text,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"postal_code" text NOT NULL,
	"country" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_design_orders" (
	"design_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"order_reference" text NOT NULL,
	CONSTRAINT "customer_design_orders_design_id_order_reference_pk" PRIMARY KEY("design_id","order_reference")
);
--> statement-breakpoint
CREATE TABLE "customer_designs" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"name" text NOT NULL,
	"format" text NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"storage_key" text,
	"preview_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_items" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"product_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer_design_orders" ADD CONSTRAINT "customer_design_orders_design_id_customer_designs_id_fk" FOREIGN KEY ("design_id") REFERENCES "public"."customer_designs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_addresses_customer_idx" ON "customer_addresses" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_addresses_one_default_idx" ON "customer_addresses" USING btree ("customer_id") WHERE "customer_addresses"."is_default";--> statement-breakpoint
CREATE INDEX "customer_design_orders_customer_idx" ON "customer_design_orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customer_designs_customer_idx" ON "customer_designs" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "saved_items_customer_idx" ON "saved_items" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "saved_items_customer_product_idx" ON "saved_items" USING btree ("customer_id","product_id");