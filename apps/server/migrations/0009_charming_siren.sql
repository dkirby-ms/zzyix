CREATE TABLE "canonical_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"principal_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"parent_attempt_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "canonical_attempts_kind_check" CHECK ("canonical_attempts"."kind" in ('entry', 'reconnect', 'resubscribe')),
	CONSTRAINT "canonical_attempts_parent_check" CHECK (("canonical_attempts"."kind" = 'entry' and "canonical_attempts"."parent_attempt_id" is null)
        or ("canonical_attempts"."kind" <> 'entry' and "canonical_attempts"."parent_attempt_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "canonical_attempts" ADD CONSTRAINT "canonical_attempts_principal_id_principals_id_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."principals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canonical_attempts" ADD CONSTRAINT "canonical_attempts_parent_attempt_id_canonical_attempts_id_fk" FOREIGN KEY ("parent_attempt_id") REFERENCES "public"."canonical_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "canonical_attempts_principal_kind_expiry_idx" ON "canonical_attempts" USING btree ("principal_id","kind","expires_at");--> statement-breakpoint
CREATE INDEX "canonical_attempts_expiry_idx" ON "canonical_attempts" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "canonical_attempts_parent_attempt_id_idx" ON "canonical_attempts" USING btree ("parent_attempt_id");