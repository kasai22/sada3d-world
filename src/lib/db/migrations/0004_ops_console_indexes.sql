CREATE INDEX "customer_designs_created_idx" ON "customer_designs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "orders_placed_idx" ON "orders" USING btree ("placed_at");