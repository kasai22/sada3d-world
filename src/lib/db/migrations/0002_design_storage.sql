CREATE TYPE "public"."design_storage_state" AS ENUM('pending', 'verified', 'failed', 'deleted');--> statement-breakpoint
CREATE TABLE "geometry_analyses" (
	"sha256" text NOT NULL,
	"analysis_version" text NOT NULL,
	"identity" text NOT NULL,
	"format" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "geometry_analyses_sha256_analysis_version_pk" PRIMARY KEY("sha256","analysis_version")
);
--> statement-breakpoint
ALTER TABLE "customer_designs" ADD COLUMN "storage_state" "design_storage_state" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_designs" ADD COLUMN "content_type" text;--> statement-breakpoint
ALTER TABLE "customer_designs" ADD COLUMN "sha256" text;--> statement-breakpoint
ALTER TABLE "customer_designs" ADD COLUMN "upload_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customer_designs" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customer_designs" ADD COLUMN "analysis_identity" text;--> statement-breakpoint
ALTER TABLE "customer_designs" ADD COLUMN "failure_code" text;--> statement-breakpoint
ALTER TABLE "customer_designs" ADD COLUMN "failure_message" text;--> statement-breakpoint
ALTER TABLE "customer_designs" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customer_designs" ADD COLUMN "object_removed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "source_design_id" text;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "source_storage_key" text;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "source_sha256" text;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "source_file_name" text;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "source_size_bytes" integer;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "source_format" text;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "source_content_type" text;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "source_analysis_identity" text;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "source_configuration" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_designs_storage_key_idx" ON "customer_designs" USING btree ("storage_key");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_designs_customer_sha256_active_idx" ON "customer_designs" USING btree ("customer_id","sha256") WHERE "customer_designs"."storage_state" in ('pending', 'verified');--> statement-breakpoint
CREATE INDEX "customer_designs_cleanup_idx" ON "customer_designs" USING btree ("storage_state","updated_at") WHERE "customer_designs"."object_removed_at" is null and "customer_designs"."storage_state" in ('failed', 'deleted');--> statement-breakpoint
CREATE INDEX "customer_designs_pending_idx" ON "customer_designs" USING btree ("upload_expires_at") WHERE "customer_designs"."storage_state" = 'pending';--> statement-breakpoint
CREATE INDEX "order_items_source_storage_key_idx" ON "order_items" USING btree ("source_storage_key") WHERE "order_items"."source_storage_key" is not null;--> statement-breakpoint
ALTER TABLE "customer_designs" ADD CONSTRAINT "customer_designs_verified_identity_check" CHECK ("customer_designs"."storage_state" <> 'verified' or ("customer_designs"."storage_key" is not null and "customer_designs"."sha256" is not null and "customer_designs"."verified_at" is not null));--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_source_file_check" CHECK ("order_items"."source_storage_key" is null or ("order_items"."type" = 'custom' and "order_items"."source_design_id" is not null and "order_items"."source_sha256" is not null and "order_items"."source_file_name" is not null and "order_items"."source_size_bytes" is not null and "order_items"."source_format" is not null));