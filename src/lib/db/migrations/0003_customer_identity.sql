CREATE TABLE "customer_carts" (
	"customer_id" text PRIMARY KEY NOT NULL,
	"cart_id" text NOT NULL,
	"lines" jsonb NOT NULL,
	"merged_guest_cart_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" text PRIMARY KEY NOT NULL,
	"auth_provider" text NOT NULL,
	"auth_subject" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "customers_auth_subject_idx" ON "customers" USING btree ("auth_provider","auth_subject");