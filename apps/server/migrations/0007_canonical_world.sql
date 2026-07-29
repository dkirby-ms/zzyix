CREATE TABLE "canonical_world" (
	"product_key" text PRIMARY KEY NOT NULL,
	"quilt_id" uuid NOT NULL,
	"status" text NOT NULL,
	"generation" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "canonical_world_product_key_check" CHECK ("canonical_world"."product_key" = 'canonical'),
	CONSTRAINT "canonical_world_status_check" CHECK ("canonical_world"."status" in ('inactive', 'active')),
	CONSTRAINT "canonical_world_generation_check" CHECK ("canonical_world"."generation" > 0)
);
--> statement-breakpoint
ALTER TABLE "canonical_world" ADD CONSTRAINT "canonical_world_quilt_id_quilts_id_fk" FOREIGN KEY ("quilt_id") REFERENCES "public"."quilts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "canonical_world_quilt_id_idx" ON "canonical_world" USING btree ("quilt_id");