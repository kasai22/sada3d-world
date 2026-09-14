import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_products_product_class" AS ENUM('STANDARD_CATALOG_PRODUCT', 'CONFIGURABLE_PRODUCT', 'QUOTE_ONLY_PRODUCT');
  CREATE TYPE "public"."enum_products_pricing_model" AS ENUM('FIXED', 'CONFIGURABLE', 'QUOTE_ONLY');
  CREATE TYPE "public"."enum__products_v_version_product_class" AS ENUM('STANDARD_CATALOG_PRODUCT', 'CONFIGURABLE_PRODUCT', 'QUOTE_ONLY_PRODUCT');
  CREATE TYPE "public"."enum__products_v_version_pricing_model" AS ENUM('FIXED', 'CONFIGURABLE', 'QUOTE_ONLY');
  ALTER TABLE "products" ADD COLUMN "sku" varchar;
  ALTER TABLE "products" ADD COLUMN "product_class" "enum_products_product_class";
  ALTER TABLE "products" ADD COLUMN "pricing_model" "enum_products_pricing_model";
  ALTER TABLE "products" ADD COLUMN "commercial_definition" jsonb;
  ALTER TABLE "_products_v" ADD COLUMN "version_sku" varchar;
  ALTER TABLE "_products_v" ADD COLUMN "version_product_class" "enum__products_v_version_product_class";
  ALTER TABLE "_products_v" ADD COLUMN "version_pricing_model" "enum__products_v_version_pricing_model";
  ALTER TABLE "_products_v" ADD COLUMN "version_commercial_definition" jsonb;
  CREATE UNIQUE INDEX "products_sku_idx" ON "products" USING btree ("sku");
  CREATE INDEX "_products_v_version_version_sku_idx" ON "_products_v" USING btree ("version_sku");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "products_sku_idx";
  DROP INDEX "_products_v_version_version_sku_idx";
  ALTER TABLE "products" DROP COLUMN "sku";
  ALTER TABLE "products" DROP COLUMN "product_class";
  ALTER TABLE "products" DROP COLUMN "pricing_model";
  ALTER TABLE "products" DROP COLUMN "commercial_definition";
  ALTER TABLE "_products_v" DROP COLUMN "version_sku";
  ALTER TABLE "_products_v" DROP COLUMN "version_product_class";
  ALTER TABLE "_products_v" DROP COLUMN "version_pricing_model";
  ALTER TABLE "_products_v" DROP COLUMN "version_commercial_definition";
  DROP TYPE "public"."enum_products_product_class";
  DROP TYPE "public"."enum_products_pricing_model";
  DROP TYPE "public"."enum__products_v_version_product_class";
  DROP TYPE "public"."enum__products_v_version_pricing_model";`)
}
