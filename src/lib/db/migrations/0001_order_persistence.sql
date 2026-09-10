CREATE TYPE "public"."manufacturing_hold_reason" AS ENUM('material_unavailable', 'machine_issue', 'design_review', 'customer_action', 'quality_issue', 'other');--> statement-breakpoint
CREATE TYPE "public"."manufacturing_event_type" AS ENUM('JOB_QUEUED', 'DESIGN_REVIEW_STARTED', 'DESIGN_APPROVED', 'FILE_PREPARED', 'MATERIAL_PREPARED', 'JOB_SCHEDULED', 'PRINT_STARTED', 'PRINT_COMPLETED', 'POST_PROCESSING_COMPLETED', 'QUALITY_STARTED', 'QUALITY_APPROVED', 'QUALITY_REJECTED', 'REWORK_STARTED', 'REWORK_COMPLETED', 'PACKAGING_STARTED', 'PACKAGING_COMPLETED', 'READY_FOR_DISPATCH', 'JOB_COMPLETED', 'JOB_FAILED', 'JOB_CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."manufacturing_state" AS ENUM('queued', 'design_review', 'file_preparation', 'material_preparation', 'scheduled', 'printing', 'post_processing', 'quality_check', 'rework', 'approved', 'packaging', 'ready_for_dispatch', 'completed', 'cancelled', 'failed');--> statement-breakpoint
CREATE TYPE "public"."order_item_status" AS ENUM('pending', 'in_progress', 'ready', 'shipped', 'delivered', 'cancelled', 'failed');--> statement-breakpoint
CREATE TYPE "public"."order_item_type" AS ENUM('catalog', 'custom');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'awaiting_payment', 'confirmed', 'fulfillment_in_progress', 'partially_fulfilled', 'fulfilled', 'cancelled', 'failed');--> statement-breakpoint
CREATE TYPE "public"."payment_state" AS ENUM('pending', 'paid', 'failed');--> statement-breakpoint
CREATE TYPE "public"."quality_result" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."shipment_status" AS ENUM('pending', 'ready', 'shipped', 'in_transit', 'delivered', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "checkout_reservations" (
	"key" text PRIMARY KEY NOT NULL,
	"order_reference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "counters" (
	"name" text PRIMARY KEY NOT NULL,
	"value" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manufacturing_events" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"type" "manufacturing_event_type" NOT NULL,
	"from_state" "manufacturing_state" NOT NULL,
	"to_state" "manufacturing_state" NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"actor" text,
	"note" text,
	"sequence" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manufacturing_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"order_item_id" text NOT NULL,
	"order_reference" text NOT NULL,
	"state" "manufacturing_state" NOT NULL,
	"quality_result" "quality_result" DEFAULT 'pending' NOT NULL,
	"rework_count" integer DEFAULT 0 NOT NULL,
	"hold_reason" "manufacturing_hold_reason",
	"hold_started_at" timestamp with time zone,
	"hold_resolved_at" timestamp with time zone,
	"hold_note" text,
	"estimated_completion_at" timestamp with time zone,
	"machine_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"version" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" text PRIMARY KEY NOT NULL,
	"order_reference" text NOT NULL,
	"type" "order_item_type" NOT NULL,
	"name" text NOT NULL,
	"spec" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" integer NOT NULL,
	"line_total" integer NOT NULL,
	"quote_rules_version" text,
	"fulfillment_status" "order_item_status" NOT NULL,
	"shipment_id" text,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"reference" text PRIMARY KEY NOT NULL,
	"cart_id" text NOT NULL,
	"customer_id" text,
	"status" "order_status" NOT NULL,
	"payment_status" "payment_state" NOT NULL,
	"payment_session_id" text,
	"payment_provider" text,
	"totals" jsonb NOT NULL,
	"contact_name" text NOT NULL,
	"contact_email" text NOT NULL,
	"contact_phone" text NOT NULL,
	"address_line1" text NOT NULL,
	"address_line2" text,
	"address_city" text NOT NULL,
	"address_state" text NOT NULL,
	"address_postal_code" text NOT NULL,
	"address_country" text NOT NULL,
	"placed_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"cancelled_at" timestamp with time zone,
	"provisional" boolean DEFAULT true NOT NULL,
	"demo" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" text PRIMARY KEY NOT NULL,
	"order_reference" text NOT NULL,
	"status" "shipment_status" NOT NULL,
	"carrier" text,
	"tracking_number" text,
	"tracking_url" text,
	"shipped_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "manufacturing_events" ADD CONSTRAINT "manufacturing_events_job_id_manufacturing_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."manufacturing_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manufacturing_jobs" ADD CONSTRAINT "manufacturing_jobs_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manufacturing_jobs" ADD CONSTRAINT "manufacturing_jobs_order_reference_orders_reference_fk" FOREIGN KEY ("order_reference") REFERENCES "public"."orders"("reference") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_reference_orders_reference_fk" FOREIGN KEY ("order_reference") REFERENCES "public"."orders"("reference") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_reference_orders_reference_fk" FOREIGN KEY ("order_reference") REFERENCES "public"."orders"("reference") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checkout_reservations_expires_idx" ON "checkout_reservations" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "manufacturing_events_job_idx" ON "manufacturing_events" USING btree ("job_id","sequence");--> statement-breakpoint
CREATE INDEX "manufacturing_events_occurred_idx" ON "manufacturing_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "manufacturing_jobs_item_idx" ON "manufacturing_jobs" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "manufacturing_jobs_order_idx" ON "manufacturing_jobs" USING btree ("order_reference");--> statement-breakpoint
CREATE INDEX "manufacturing_jobs_state_idx" ON "manufacturing_jobs" USING btree ("state");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_reference");--> statement-breakpoint
CREATE INDEX "orders_customer_placed_idx" ON "orders" USING btree ("customer_id","placed_at");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "orders_contact_email_idx" ON "orders" USING btree ("contact_email");--> statement-breakpoint
CREATE INDEX "shipments_order_idx" ON "shipments" USING btree ("order_reference");