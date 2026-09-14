import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_products_price_status" AS ENUM('verified', 'provisional', 'quote-only');
  CREATE TYPE "public"."enum__products_v_version_price_status" AS ENUM('verified', 'provisional', 'quote-only');
  CREATE TYPE "public"."enum_materials_technologies" AS ENUM('fdm', 'sla');
  CREATE TYPE "public"."enum__materials_v_version_technologies" AS ENUM('fdm', 'sla');
  CREATE TABLE "materials_technologies" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_materials_technologies",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "materials_best_for" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"value" varchar
  );
  
  CREATE TABLE "materials_avoid_for" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"value" varchar
  );
  
  CREATE TABLE "_materials_v_version_technologies" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum__materials_v_version_technologies",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "_materials_v_version_best_for" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"value" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_materials_v_version_avoid_for" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"value" varchar,
  	"_uuid" varchar
  );
  
  ALTER TABLE "products" ADD COLUMN "price_status" "enum_products_price_status" DEFAULT 'provisional';
  ALTER TABLE "_products_v" ADD COLUMN "version_price_status" "enum__products_v_version_price_status" DEFAULT 'provisional';
  ALTER TABLE "categories" ADD COLUMN "description" varchar;
  ALTER TABLE "_categories_v" ADD COLUMN "version_description" varchar;
  ALTER TABLE "materials" ADD COLUMN "seo_title" varchar;
  ALTER TABLE "materials" ADD COLUMN "seo_description" varchar;
  ALTER TABLE "_materials_v" ADD COLUMN "version_seo_title" varchar;
  ALTER TABLE "_materials_v" ADD COLUMN "version_seo_description" varchar;
  ALTER TABLE "materials_technologies" ADD CONSTRAINT "materials_technologies_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."materials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "materials_best_for" ADD CONSTRAINT "materials_best_for_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."materials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "materials_avoid_for" ADD CONSTRAINT "materials_avoid_for_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."materials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_materials_v_version_technologies" ADD CONSTRAINT "_materials_v_version_technologies_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_materials_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_materials_v_version_best_for" ADD CONSTRAINT "_materials_v_version_best_for_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_materials_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_materials_v_version_avoid_for" ADD CONSTRAINT "_materials_v_version_avoid_for_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_materials_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "materials_technologies_order_idx" ON "materials_technologies" USING btree ("order");
  CREATE INDEX "materials_technologies_parent_idx" ON "materials_technologies" USING btree ("parent_id");
  CREATE INDEX "materials_best_for_order_idx" ON "materials_best_for" USING btree ("_order");
  CREATE INDEX "materials_best_for_parent_id_idx" ON "materials_best_for" USING btree ("_parent_id");
  CREATE INDEX "materials_avoid_for_order_idx" ON "materials_avoid_for" USING btree ("_order");
  CREATE INDEX "materials_avoid_for_parent_id_idx" ON "materials_avoid_for" USING btree ("_parent_id");
  CREATE INDEX "_materials_v_version_technologies_order_idx" ON "_materials_v_version_technologies" USING btree ("order");
  CREATE INDEX "_materials_v_version_technologies_parent_idx" ON "_materials_v_version_technologies" USING btree ("parent_id");
  CREATE INDEX "_materials_v_version_best_for_order_idx" ON "_materials_v_version_best_for" USING btree ("_order");
  CREATE INDEX "_materials_v_version_best_for_parent_id_idx" ON "_materials_v_version_best_for" USING btree ("_parent_id");
  CREATE INDEX "_materials_v_version_avoid_for_order_idx" ON "_materials_v_version_avoid_for" USING btree ("_order");
  CREATE INDEX "_materials_v_version_avoid_for_parent_id_idx" ON "_materials_v_version_avoid_for" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "materials_technologies" CASCADE;
  DROP TABLE "materials_best_for" CASCADE;
  DROP TABLE "materials_avoid_for" CASCADE;
  DROP TABLE "_materials_v_version_technologies" CASCADE;
  DROP TABLE "_materials_v_version_best_for" CASCADE;
  DROP TABLE "_materials_v_version_avoid_for" CASCADE;
  ALTER TABLE "products" DROP COLUMN "price_status";
  ALTER TABLE "_products_v" DROP COLUMN "version_price_status";
  ALTER TABLE "categories" DROP COLUMN "description";
  ALTER TABLE "_categories_v" DROP COLUMN "version_description";
  ALTER TABLE "materials" DROP COLUMN "seo_title";
  ALTER TABLE "materials" DROP COLUMN "seo_description";
  ALTER TABLE "_materials_v" DROP COLUMN "version_seo_title";
  ALTER TABLE "_materials_v" DROP COLUMN "version_seo_description";
  DROP TYPE "public"."enum_products_price_status";
  DROP TYPE "public"."enum__products_v_version_price_status";
  DROP TYPE "public"."enum_materials_technologies";
  DROP TYPE "public"."enum__materials_v_version_technologies";`)
}
