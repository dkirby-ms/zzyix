CREATE TABLE "quilt_presence_leases" (
	"socket_id" text PRIMARY KEY NOT NULL,
	"quilt_id" uuid NOT NULL,
	"principal_id" uuid NOT NULL,
	"client_id" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quilt_presence_leases" ADD CONSTRAINT "quilt_presence_leases_quilt_id_quilts_id_fk" FOREIGN KEY ("quilt_id") REFERENCES "public"."quilts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quilt_presence_leases" ADD CONSTRAINT "quilt_presence_leases_principal_id_principals_id_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."principals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quilt_presence_leases_principal_expiry_idx" ON "quilt_presence_leases" USING btree ("quilt_id","principal_id","expires_at");--> statement-breakpoint
CREATE INDEX "quilt_presence_leases_expiry_idx" ON "quilt_presence_leases" USING btree ("expires_at");