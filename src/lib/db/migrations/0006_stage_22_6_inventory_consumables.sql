-- Stage 22.6: consumables and supplier links on inventory items.
-- unit_cost widens from whole rupees (integer) to rupees and paise (numeric 12,2): lossless for every existing value.
-- The other changes are additive and nullable. The append-only trigger on inventory_movements fires on row changes, not on this DDL.
ALTER TABLE "inventory_items" ALTER COLUMN "unit_cost" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "inventory_movements" ALTER COLUMN "unit_cost" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "inventory_purchases" ALTER COLUMN "unit_cost" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "supplier_id" text;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_items_supplier_idx" ON "inventory_items" USING btree ("supplier_id");