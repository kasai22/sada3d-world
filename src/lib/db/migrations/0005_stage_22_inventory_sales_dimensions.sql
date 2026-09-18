CREATE TYPE "public"."inventory_item_type" AS ENUM('RAW_MATERIAL', 'FINISHED_PRODUCT', 'CONSUMABLE', 'PACKAGING', 'SPARE_PART', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."inventory_movement_type" AS ENUM('OPENING_BALANCE', 'PURCHASE', 'USAGE', 'SALE', 'RETURN', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'WASTE');--> statement-breakpoint
CREATE TYPE "public"."inventory_purchase_status" AS ENUM('ordered', 'received', 'cancelled');--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" text PRIMARY KEY NOT NULL,
	"definition_key" text,
	"sku" text,
	"name" text NOT NULL,
	"item_type" "inventory_item_type" NOT NULL,
	"category" text,
	"material" text,
	"colour" text,
	"unit" text NOT NULL,
	"product_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"current_quantity" numeric(14, 3),
	"opening_quantity" numeric(14, 3),
	"opened_at" timestamp with time zone,
	"reorder_level" numeric(14, 3),
	"target_stock" numeric(14, 3),
	"unit_cost" integer,
	"unit_cost_source" text,
	"unit_cost_updated_at" timestamp with time zone,
	"unit_cost_updated_by" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_items_quantity_check" CHECK ("inventory_items"."current_quantity" is null or "inventory_items"."current_quantity" >= 0),
	CONSTRAINT "inventory_items_thresholds_check" CHECK (("inventory_items"."reorder_level" is null or "inventory_items"."reorder_level" >= 0) and ("inventory_items"."target_stock" is null or "inventory_items"."target_stock" >= 0)),
	CONSTRAINT "inventory_items_cost_check" CHECK ("inventory_items"."unit_cost" is null or "inventory_items"."unit_cost" >= 0),
	CONSTRAINT "inventory_items_product_check" CHECK ("inventory_items"."product_id" is null or "inventory_items"."item_type" = 'FINISHED_PRODUCT')
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"type" "inventory_movement_type" NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"quantity_delta" numeric(14, 3) NOT NULL,
	"balance_after" numeric(14, 3) NOT NULL,
	"unit_cost" integer,
	"reference_type" text NOT NULL,
	"reference_id" text,
	"supplier_id" text,
	"notes" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_movements_balance_check" CHECK ("inventory_movements"."balance_after" >= 0),
	CONSTRAINT "inventory_movements_cost_check" CHECK ("inventory_movements"."unit_cost" is null or "inventory_movements"."unit_cost" >= 0)
);
--> statement-breakpoint
CREATE TABLE "inventory_purchases" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"supplier_id" text,
	"quantity" numeric(14, 3) NOT NULL,
	"unit_cost" integer,
	"reference" text,
	"status" "inventory_purchase_status" DEFAULT 'ordered' NOT NULL,
	"notes" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"received_at" timestamp with time zone,
	"received_by" text,
	"movement_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_purchases_quantity_check" CHECK ("inventory_purchases"."quantity" > 0),
	CONSTRAINT "inventory_purchases_cost_check" CHECK ("inventory_purchases"."unit_cost" is null or "inventory_purchases"."unit_cost" >= 0),
	CONSTRAINT "inventory_purchases_receipt_check" CHECK (("inventory_purchases"."status" = 'received') = ("inventory_purchases"."movement_id" is not null and "inventory_purchases"."received_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"supplier_type" text,
	"contact_person" text,
	"phone" text,
	"email" text,
	"lead_time_days" integer,
	"payment_terms" text,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suppliers_lead_time_check" CHECK ("suppliers"."lead_time_days" is null or "suppliers"."lead_time_days" >= 0)
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "product_id" text;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "product_sku" text;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "category_id" text;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "category_name" text;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "browse_category_id" text;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "browse_category_name" text;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "dimensions_recorded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_purchases" ADD CONSTRAINT "inventory_purchases_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_purchases" ADD CONSTRAINT "inventory_purchases_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_purchases" ADD CONSTRAINT "inventory_purchases_movement_id_inventory_movements_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."inventory_movements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_items_definition_idx" ON "inventory_items" USING btree ("definition_key");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_items_sku_idx" ON "inventory_items" USING btree ("sku");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_items_product_idx" ON "inventory_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "inventory_items_type_idx" ON "inventory_items" USING btree ("item_type","active");--> statement-breakpoint
CREATE INDEX "inventory_movements_item_idx" ON "inventory_movements" USING btree ("item_id","occurred_at");--> statement-breakpoint
CREATE INDEX "inventory_movements_occurred_idx" ON "inventory_movements" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "inventory_movements_type_idx" ON "inventory_movements" USING btree ("type");--> statement-breakpoint
CREATE INDEX "inventory_movements_reference_idx" ON "inventory_movements" USING btree ("reference_type","reference_id");--> statement-breakpoint
CREATE INDEX "inventory_purchases_status_idx" ON "inventory_purchases" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "inventory_purchases_item_idx" ON "inventory_purchases" USING btree ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_name_idx" ON "suppliers" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "order_items_product_idx" ON "order_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "order_items_category_idx" ON "order_items" USING btree ("category_id");--> statement-breakpoint
-- The inventory ledger is append-only: a correction is a new movement, never an edit.
CREATE FUNCTION "inventory_movements_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'inventory_movements is append-only: record a correcting movement instead';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "inventory_movements_append_only" BEFORE UPDATE OR DELETE ON "inventory_movements" FOR EACH ROW EXECUTE FUNCTION "inventory_movements_append_only"();--> statement-breakpoint
CREATE TRIGGER "inventory_movements_no_truncate" BEFORE TRUNCATE ON "inventory_movements" FOR EACH STATEMENT EXECUTE FUNCTION "inventory_movements_append_only"();
