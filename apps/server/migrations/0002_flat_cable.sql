CREATE TABLE "idempotency_keys" (
	"key" text NOT NULL,
	"client_id" text NOT NULL,
	"request_hash" text NOT NULL,
	"status_code" integer NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "idempotency_keys_pk" PRIMARY KEY("key","client_id"),
	CONSTRAINT "idempotency_keys_client_id_key_unique" UNIQUE("client_id","key")
);
--> statement-breakpoint
ALTER TABLE "canvases" ADD COLUMN "version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys" USING btree ("expires_at");