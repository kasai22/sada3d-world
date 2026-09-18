import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_categories_source" AS ENUM('admin', 'seed');
  CREATE TYPE "public"."enum__categories_v_version_source" AS ENUM('admin', 'seed');
  ALTER TABLE "products" ADD COLUMN "recommended" boolean DEFAULT false;
  ALTER TABLE "_products_v" ADD COLUMN "version_recommended" boolean DEFAULT false;
  ALTER TABLE "categories" ADD COLUMN "source" "enum_categories_source" DEFAULT 'admin';
  ALTER TABLE "_categories_v" ADD COLUMN "version_source" "enum__categories_v_version_source" DEFAULT 'admin';`)

  /*
   * Stage 20 data correction, catalog content only. New categories default to
   * administrator-managed; the three categories written by content:import are
   * the repository seed, so the import keeps syncing them.
   */
  await db.execute(sql`
   UPDATE "categories" SET "source" = 'seed' WHERE "value" IN ('mechanical', 'gears', 'spacers');
   UPDATE "_categories_v" SET "version_source" = 'seed' WHERE "version_value" IN ('mechanical', 'gears', 'spacers');`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "products" DROP COLUMN "recommended";
  ALTER TABLE "_products_v" DROP COLUMN "version_recommended";
  ALTER TABLE "categories" DROP COLUMN "source";
  ALTER TABLE "_categories_v" DROP COLUMN "version_source";
  DROP TYPE "public"."enum_categories_source";
  DROP TYPE "public"."enum__categories_v_version_source";`)
}
