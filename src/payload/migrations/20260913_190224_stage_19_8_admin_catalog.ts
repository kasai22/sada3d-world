import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_products_open_questions_answer" AS ENUM('unanswered', 'yes', 'no');
  CREATE TYPE "public"."enum_products_source" AS ENUM('admin', 'seed');
  CREATE TYPE "public"."enum_products_visual_requirement" AS ENUM('REAL_PHOTO', 'APPROVED_RENDER');
  CREATE TYPE "public"."enum__products_v_version_open_questions_answer" AS ENUM('unanswered', 'yes', 'no');
  CREATE TYPE "public"."enum__products_v_version_source" AS ENUM('admin', 'seed');
  CREATE TYPE "public"."enum__products_v_version_visual_requirement" AS ENUM('REAL_PHOTO', 'APPROVED_RENDER');
  CREATE TABLE "products_customers" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"value" varchar
  );
  
  CREATE TABLE "products_open_questions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"question_id" varchar,
  	"question" varchar,
  	"answer" "enum_products_open_questions_answer" DEFAULT 'unanswered',
  	"reference" varchar,
  	"approved_by" varchar,
  	"approved_on" timestamp(3) with time zone
  );
  
  CREATE TABLE "_products_v_version_customers" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"value" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_products_v_version_open_questions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"question_id" varchar,
  	"question" varchar,
  	"answer" "enum__products_v_version_open_questions_answer" DEFAULT 'unanswered',
  	"reference" varchar,
  	"approved_by" varchar,
  	"approved_on" timestamp(3) with time zone,
  	"_uuid" varchar
  );
  
  ALTER TABLE "products" ADD COLUMN "source" "enum_products_source" DEFAULT 'admin';
  ALTER TABLE "products" ADD COLUMN "use_case" varchar;
  ALTER TABLE "products" ADD COLUMN "weight_grams" numeric;
  ALTER TABLE "products" ADD COLUMN "visual_approval_reference" varchar;
  ALTER TABLE "products" ADD COLUMN "visual_approval_approved_by" varchar;
  ALTER TABLE "products" ADD COLUMN "visual_approval_approved_on" timestamp(3) with time zone;
  ALTER TABLE "products" ADD COLUMN "visual_requirement" "enum_products_visual_requirement";
  ALTER TABLE "products" ADD COLUMN "render_specification" varchar;
  ALTER TABLE "products" ADD COLUMN "commercial_approval_reference" varchar;
  ALTER TABLE "products" ADD COLUMN "commercial_approval_approved_by" varchar;
  ALTER TABLE "products" ADD COLUMN "commercial_approval_approved_on" timestamp(3) with time zone;
  ALTER TABLE "_products_v" ADD COLUMN "version_source" "enum__products_v_version_source" DEFAULT 'admin';
  ALTER TABLE "_products_v" ADD COLUMN "version_use_case" varchar;
  ALTER TABLE "_products_v" ADD COLUMN "version_weight_grams" numeric;
  ALTER TABLE "_products_v" ADD COLUMN "version_visual_approval_reference" varchar;
  ALTER TABLE "_products_v" ADD COLUMN "version_visual_approval_approved_by" varchar;
  ALTER TABLE "_products_v" ADD COLUMN "version_visual_approval_approved_on" timestamp(3) with time zone;
  ALTER TABLE "_products_v" ADD COLUMN "version_visual_requirement" "enum__products_v_version_visual_requirement";
  ALTER TABLE "_products_v" ADD COLUMN "version_render_specification" varchar;
  ALTER TABLE "_products_v" ADD COLUMN "version_commercial_approval_reference" varchar;
  ALTER TABLE "_products_v" ADD COLUMN "version_commercial_approval_approved_by" varchar;
  ALTER TABLE "_products_v" ADD COLUMN "version_commercial_approval_approved_on" timestamp(3) with time zone;
  ALTER TABLE "products_customers" ADD CONSTRAINT "products_customers_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_open_questions" ADD CONSTRAINT "products_open_questions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v_version_customers" ADD CONSTRAINT "_products_v_version_customers_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_products_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v_version_open_questions" ADD CONSTRAINT "_products_v_version_open_questions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_products_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "products_customers_order_idx" ON "products_customers" USING btree ("_order");
  CREATE INDEX "products_customers_parent_id_idx" ON "products_customers" USING btree ("_parent_id");
  CREATE INDEX "products_open_questions_order_idx" ON "products_open_questions" USING btree ("_order");
  CREATE INDEX "products_open_questions_parent_id_idx" ON "products_open_questions" USING btree ("_parent_id");
  CREATE INDEX "_products_v_version_customers_order_idx" ON "_products_v_version_customers" USING btree ("_order");
  CREATE INDEX "_products_v_version_customers_parent_id_idx" ON "_products_v_version_customers" USING btree ("_parent_id");
  CREATE INDEX "_products_v_version_open_questions_order_idx" ON "_products_v_version_open_questions" USING btree ("_order");
  CREATE INDEX "_products_v_version_open_questions_parent_id_idx" ON "_products_v_version_open_questions" USING btree ("_parent_id");`)

  /*
   * Content-only data correction (Stage 19.8). The new column defaults to
   * "admin", which would mark the three repository seed products as
   * administrator-managed and stop content:import keeping them in sync. They
   * were created by the import from src/content/catalog, so they are seeds.
   * Touches only these product rows; no customer, order or payment data.
   */
  await db.execute(sql`
   UPDATE "products" SET "source" = 'seed' WHERE "product_id" IN ('p-101', 'p-102', 'p-103');
   UPDATE "_products_v" SET "version_source" = 'seed' WHERE "version_product_id" IN ('p-101', 'p-102', 'p-103');`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "products_customers" CASCADE;
  DROP TABLE "products_open_questions" CASCADE;
  DROP TABLE "_products_v_version_customers" CASCADE;
  DROP TABLE "_products_v_version_open_questions" CASCADE;
  ALTER TABLE "products" DROP COLUMN "source";
  ALTER TABLE "products" DROP COLUMN "use_case";
  ALTER TABLE "products" DROP COLUMN "weight_grams";
  ALTER TABLE "products" DROP COLUMN "visual_approval_reference";
  ALTER TABLE "products" DROP COLUMN "visual_approval_approved_by";
  ALTER TABLE "products" DROP COLUMN "visual_approval_approved_on";
  ALTER TABLE "products" DROP COLUMN "visual_requirement";
  ALTER TABLE "products" DROP COLUMN "render_specification";
  ALTER TABLE "products" DROP COLUMN "commercial_approval_reference";
  ALTER TABLE "products" DROP COLUMN "commercial_approval_approved_by";
  ALTER TABLE "products" DROP COLUMN "commercial_approval_approved_on";
  ALTER TABLE "_products_v" DROP COLUMN "version_source";
  ALTER TABLE "_products_v" DROP COLUMN "version_use_case";
  ALTER TABLE "_products_v" DROP COLUMN "version_weight_grams";
  ALTER TABLE "_products_v" DROP COLUMN "version_visual_approval_reference";
  ALTER TABLE "_products_v" DROP COLUMN "version_visual_approval_approved_by";
  ALTER TABLE "_products_v" DROP COLUMN "version_visual_approval_approved_on";
  ALTER TABLE "_products_v" DROP COLUMN "version_visual_requirement";
  ALTER TABLE "_products_v" DROP COLUMN "version_render_specification";
  ALTER TABLE "_products_v" DROP COLUMN "version_commercial_approval_reference";
  ALTER TABLE "_products_v" DROP COLUMN "version_commercial_approval_approved_by";
  ALTER TABLE "_products_v" DROP COLUMN "version_commercial_approval_approved_on";
  DROP TYPE "public"."enum_products_open_questions_answer";
  DROP TYPE "public"."enum_products_source";
  DROP TYPE "public"."enum_products_visual_requirement";
  DROP TYPE "public"."enum__products_v_version_open_questions_answer";
  DROP TYPE "public"."enum__products_v_version_source";
  DROP TYPE "public"."enum__products_v_version_visual_requirement";`)
}
