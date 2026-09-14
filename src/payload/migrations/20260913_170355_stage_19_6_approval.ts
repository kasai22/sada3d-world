import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_products_approval_status" AS ENUM('draft', 'proposed', 'provisional', 'approved', 'archived');
  CREATE TYPE "public"."enum_products_visual_kind" AS ENUM('photo', 'render');
  CREATE TYPE "public"."enum__products_v_version_approval_status" AS ENUM('draft', 'proposed', 'provisional', 'approved', 'archived');
  CREATE TYPE "public"."enum__products_v_version_visual_kind" AS ENUM('photo', 'render');
  CREATE TYPE "public"."enum_price_approvals_currency" AS ENUM('INR');
  CREATE TYPE "public"."enum_media_kind" AS ENUM('photo', 'render');
  CREATE TYPE "public"."enum__media_v_version_kind" AS ENUM('photo', 'render');
  CREATE TABLE "price_approvals" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"product_id" integer NOT NULL,
  	"amount" numeric NOT NULL,
  	"currency" "enum_price_approvals_currency" DEFAULT 'INR' NOT NULL,
  	"effective_from" timestamp(3) with time zone NOT NULL,
  	"reference" varchar NOT NULL,
  	"approved_by" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "products" ALTER COLUMN "price_status" SET DATA TYPE text;
  ALTER TABLE "products" ALTER COLUMN "price_status" SET DEFAULT 'provisional'::text;
  DROP TYPE "public"."enum_products_price_status";
  CREATE TYPE "public"."enum_products_price_status" AS ENUM('provisional', 'approved', 'quote-only');
  ALTER TABLE "products" ALTER COLUMN "price_status" SET DEFAULT 'provisional'::"public"."enum_products_price_status";
  ALTER TABLE "products" ALTER COLUMN "price_status" SET DATA TYPE "public"."enum_products_price_status" USING "price_status"::"public"."enum_products_price_status";
  ALTER TABLE "_products_v" ALTER COLUMN "version_price_status" SET DATA TYPE text;
  ALTER TABLE "_products_v" ALTER COLUMN "version_price_status" SET DEFAULT 'provisional'::text;
  DROP TYPE "public"."enum__products_v_version_price_status";
  CREATE TYPE "public"."enum__products_v_version_price_status" AS ENUM('provisional', 'approved', 'quote-only');
  ALTER TABLE "_products_v" ALTER COLUMN "version_price_status" SET DEFAULT 'provisional'::"public"."enum__products_v_version_price_status";
  ALTER TABLE "_products_v" ALTER COLUMN "version_price_status" SET DATA TYPE "public"."enum__products_v_version_price_status" USING "version_price_status"::"public"."enum__products_v_version_price_status";
  ALTER TABLE "products" ADD COLUMN "approval_status" "enum_products_approval_status" DEFAULT 'draft';
  ALTER TABLE "products" ADD COLUMN "approval_reference" varchar;
  ALTER TABLE "products" ADD COLUMN "approval_approved_by" varchar;
  ALTER TABLE "products" ADD COLUMN "approval_approved_on" timestamp(3) with time zone;
  ALTER TABLE "products" ADD COLUMN "featured" boolean DEFAULT false;
  ALTER TABLE "products" ADD COLUMN "visual_src" varchar;
  ALTER TABLE "products" ADD COLUMN "visual_alt" varchar;
  ALTER TABLE "products" ADD COLUMN "visual_kind" "enum_products_visual_kind";
  ALTER TABLE "_products_v" ADD COLUMN "version_approval_status" "enum__products_v_version_approval_status" DEFAULT 'draft';
  ALTER TABLE "_products_v" ADD COLUMN "version_approval_reference" varchar;
  ALTER TABLE "_products_v" ADD COLUMN "version_approval_approved_by" varchar;
  ALTER TABLE "_products_v" ADD COLUMN "version_approval_approved_on" timestamp(3) with time zone;
  ALTER TABLE "_products_v" ADD COLUMN "version_featured" boolean DEFAULT false;
  ALTER TABLE "_products_v" ADD COLUMN "version_visual_src" varchar;
  ALTER TABLE "_products_v" ADD COLUMN "version_visual_alt" varchar;
  ALTER TABLE "_products_v" ADD COLUMN "version_visual_kind" "enum__products_v_version_visual_kind";
  ALTER TABLE "media" ADD COLUMN "kind" "enum_media_kind";
  ALTER TABLE "_media_v" ADD COLUMN "version_kind" "enum__media_v_version_kind";
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "price_approvals_id" integer;
  ALTER TABLE "price_approvals" ADD CONSTRAINT "price_approvals_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "price_approvals_product_idx" ON "price_approvals" USING btree ("product_id");
  CREATE INDEX "price_approvals_updated_at_idx" ON "price_approvals" USING btree ("updated_at");
  CREATE INDEX "price_approvals_created_at_idx" ON "price_approvals" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_price_approvals_fk" FOREIGN KEY ("price_approvals_id") REFERENCES "public"."price_approvals"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_price_approvals_id_idx" ON "payload_locked_documents_rels" USING btree ("price_approvals_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "price_approvals" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "price_approvals" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_price_approvals_fk";
  
  ALTER TABLE "products" ALTER COLUMN "price_status" SET DATA TYPE text;
  ALTER TABLE "products" ALTER COLUMN "price_status" SET DEFAULT 'provisional'::text;
  DROP TYPE "public"."enum_products_price_status";
  CREATE TYPE "public"."enum_products_price_status" AS ENUM('verified', 'provisional', 'quote-only');
  ALTER TABLE "products" ALTER COLUMN "price_status" SET DEFAULT 'provisional'::"public"."enum_products_price_status";
  ALTER TABLE "products" ALTER COLUMN "price_status" SET DATA TYPE "public"."enum_products_price_status" USING "price_status"::"public"."enum_products_price_status";
  ALTER TABLE "_products_v" ALTER COLUMN "version_price_status" SET DATA TYPE text;
  ALTER TABLE "_products_v" ALTER COLUMN "version_price_status" SET DEFAULT 'provisional'::text;
  DROP TYPE "public"."enum__products_v_version_price_status";
  CREATE TYPE "public"."enum__products_v_version_price_status" AS ENUM('verified', 'provisional', 'quote-only');
  ALTER TABLE "_products_v" ALTER COLUMN "version_price_status" SET DEFAULT 'provisional'::"public"."enum__products_v_version_price_status";
  ALTER TABLE "_products_v" ALTER COLUMN "version_price_status" SET DATA TYPE "public"."enum__products_v_version_price_status" USING "version_price_status"::"public"."enum__products_v_version_price_status";
  DROP INDEX "payload_locked_documents_rels_price_approvals_id_idx";
  ALTER TABLE "products" DROP COLUMN "approval_status";
  ALTER TABLE "products" DROP COLUMN "approval_reference";
  ALTER TABLE "products" DROP COLUMN "approval_approved_by";
  ALTER TABLE "products" DROP COLUMN "approval_approved_on";
  ALTER TABLE "products" DROP COLUMN "featured";
  ALTER TABLE "products" DROP COLUMN "visual_src";
  ALTER TABLE "products" DROP COLUMN "visual_alt";
  ALTER TABLE "products" DROP COLUMN "visual_kind";
  ALTER TABLE "_products_v" DROP COLUMN "version_approval_status";
  ALTER TABLE "_products_v" DROP COLUMN "version_approval_reference";
  ALTER TABLE "_products_v" DROP COLUMN "version_approval_approved_by";
  ALTER TABLE "_products_v" DROP COLUMN "version_approval_approved_on";
  ALTER TABLE "_products_v" DROP COLUMN "version_featured";
  ALTER TABLE "_products_v" DROP COLUMN "version_visual_src";
  ALTER TABLE "_products_v" DROP COLUMN "version_visual_alt";
  ALTER TABLE "_products_v" DROP COLUMN "version_visual_kind";
  ALTER TABLE "media" DROP COLUMN "kind";
  ALTER TABLE "_media_v" DROP COLUMN "version_kind";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "price_approvals_id";
  DROP TYPE "public"."enum_products_approval_status";
  DROP TYPE "public"."enum_products_visual_kind";
  DROP TYPE "public"."enum__products_v_version_approval_status";
  DROP TYPE "public"."enum__products_v_version_visual_kind";
  DROP TYPE "public"."enum_price_approvals_currency";
  DROP TYPE "public"."enum_media_kind";
  DROP TYPE "public"."enum__media_v_version_kind";`)
}
