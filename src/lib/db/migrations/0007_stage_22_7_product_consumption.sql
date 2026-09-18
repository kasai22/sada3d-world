-- Stage 22.7: expected manufacturing consumption per finished unit (a manual bill of materials).
-- Additive: one new table referencing inventory_items. No existing row is touched.
CREATE TABLE "product_consumption" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"inventory_item_id" text NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_consumption_quantity_check" CHECK ("product_consumption"."quantity" > 0)
);
--> statement-breakpoint
ALTER TABLE "product_consumption" ADD CONSTRAINT "product_consumption_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_consumption_active_idx" ON "product_consumption" USING btree ("product_id","inventory_item_id") WHERE "product_consumption"."active";--> statement-breakpoint
CREATE INDEX "product_consumption_product_idx" ON "product_consumption" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_consumption_item_idx" ON "product_consumption" USING btree ("inventory_item_id");