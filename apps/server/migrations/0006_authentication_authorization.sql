CREATE TABLE "authorization_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" text NOT NULL,
	"attempted_action" text NOT NULL,
	"outcome" text NOT NULL,
	"reason_code" text,
	"actor_principal_id" uuid,
	"subject_principal_id" uuid,
	"quilt_id" uuid,
	"patch_id" uuid,
	"request_id" text,
	"socket_id" text,
	"operation_id" uuid,
	"source_channel" text NOT NULL,
	"replica_id" text,
	"policy_version" integer,
	"before_state" jsonb,
	"after_state" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "authorization_audit_events_outcome_check" CHECK ("authorization_audit_events"."outcome" in ('allowed', 'denied', 'succeeded', 'failed')),
	CONSTRAINT "authorization_audit_events_source_channel_check" CHECK ("authorization_audit_events"."source_channel" in ('http', 'socket', 'job', 'operation')),
	CONSTRAINT "authorization_audit_events_policy_version_check" CHECK ("authorization_audit_events"."policy_version" is null or "authorization_audit_events"."policy_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "patch_claim_quota_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operation_id" uuid NOT NULL,
	"principal_id" uuid NOT NULL,
	"quilt_id" uuid NOT NULL,
	"patch_id" uuid NOT NULL,
	"outcome" text NOT NULL,
	"reason_code" text,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "patch_claim_quota_records_operation_id_unique" UNIQUE("operation_id"),
	CONSTRAINT "patch_claim_quota_records_outcome_check" CHECK ("patch_claim_quota_records"."outcome" in ('claimed', 'denied', 'conflict'))
);
--> statement-breakpoint
CREATE TABLE "patch_visibility_policies" (
	"patch_id" uuid PRIMARY KEY NOT NULL,
	"existence" text DEFAULT 'authenticated' NOT NULL,
	"fine_data" text DEFAULT 'authenticated' NOT NULL,
	"aggregate_data" text DEFAULT 'authenticated' NOT NULL,
	"presence" text DEFAULT 'authenticated' NOT NULL,
	"search" text DEFAULT 'authenticated' NOT NULL,
	"durable_events" text DEFAULT 'authenticated' NOT NULL,
	"claim_enabled" boolean DEFAULT false NOT NULL,
	"policy_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "patch_visibility_policies_existence_check" CHECK ("patch_visibility_policies"."existence" in ('hidden', 'authenticated', 'public')),
	CONSTRAINT "patch_visibility_policies_fine_data_check" CHECK ("patch_visibility_policies"."fine_data" in ('hidden', 'authenticated', 'public')),
	CONSTRAINT "patch_visibility_policies_aggregate_data_check" CHECK ("patch_visibility_policies"."aggregate_data" in ('hidden', 'authenticated', 'public')),
	CONSTRAINT "patch_visibility_policies_presence_check" CHECK ("patch_visibility_policies"."presence" in ('hidden', 'authenticated', 'public') and "patch_visibility_policies"."presence" <> 'public'),
	CONSTRAINT "patch_visibility_policies_search_check" CHECK ("patch_visibility_policies"."search" in ('hidden', 'authenticated', 'public')),
	CONSTRAINT "patch_visibility_policies_durable_events_check" CHECK ("patch_visibility_policies"."durable_events" in ('hidden', 'authenticated', 'public')),
	CONSTRAINT "patch_visibility_policies_policy_version_check" CHECK ("patch_visibility_policies"."policy_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "pending_ownership_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operation_id" uuid NOT NULL,
	"patch_id" uuid NOT NULL,
	"sender_principal_id" uuid NOT NULL,
	"recipient_principal_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pending_ownership_transfers_operation_id_unique" UNIQUE("operation_id"),
	CONSTRAINT "pending_ownership_transfers_status_check" CHECK ("pending_ownership_transfers"."status" in ('pending', 'accepted', 'cancelled', 'expired')),
	CONSTRAINT "pending_ownership_transfers_distinct_principals_check" CHECK ("pending_ownership_transfers"."sender_principal_id" <> "pending_ownership_transfers"."recipient_principal_id"),
	CONSTRAINT "pending_ownership_transfers_resolution_check" CHECK (("pending_ownership_transfers"."status" = 'pending' and "pending_ownership_transfers"."resolved_at" is null)
        or ("pending_ownership_transfers"."status" <> 'pending' and "pending_ownership_transfers"."resolved_at" is not null))
);
--> statement-breakpoint
DROP INDEX "external_principal_mappings_principal_idx";--> statement-breakpoint
ALTER TABLE "principals" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "principals" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "principals" ADD COLUMN "deletion_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "principals" ADD COLUMN "deletion_recovery_deadline" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "principals" ADD COLUMN "deletion_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "principals" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "authorization_audit_events" ADD CONSTRAINT "authorization_audit_events_actor_principal_id_principals_id_fk" FOREIGN KEY ("actor_principal_id") REFERENCES "public"."principals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authorization_audit_events" ADD CONSTRAINT "authorization_audit_events_subject_principal_id_principals_id_fk" FOREIGN KEY ("subject_principal_id") REFERENCES "public"."principals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authorization_audit_events" ADD CONSTRAINT "authorization_audit_events_quilt_id_quilts_id_fk" FOREIGN KEY ("quilt_id") REFERENCES "public"."quilts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authorization_audit_events" ADD CONSTRAINT "authorization_audit_events_patch_id_patches_id_fk" FOREIGN KEY ("patch_id") REFERENCES "public"."patches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patch_claim_quota_records" ADD CONSTRAINT "patch_claim_quota_records_principal_id_principals_id_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."principals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patch_claim_quota_records" ADD CONSTRAINT "patch_claim_quota_records_quilt_id_quilts_id_fk" FOREIGN KEY ("quilt_id") REFERENCES "public"."quilts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patch_claim_quota_records" ADD CONSTRAINT "patch_claim_quota_records_patch_id_patches_id_fk" FOREIGN KEY ("patch_id") REFERENCES "public"."patches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patch_visibility_policies" ADD CONSTRAINT "patch_visibility_policies_patch_id_patches_id_fk" FOREIGN KEY ("patch_id") REFERENCES "public"."patches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_ownership_transfers" ADD CONSTRAINT "pending_ownership_transfers_patch_id_patches_id_fk" FOREIGN KEY ("patch_id") REFERENCES "public"."patches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_ownership_transfers" ADD CONSTRAINT "pending_ownership_transfers_sender_principal_id_principals_id_fk" FOREIGN KEY ("sender_principal_id") REFERENCES "public"."principals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_ownership_transfers" ADD CONSTRAINT "pending_ownership_transfers_recipient_principal_id_principals_id_fk" FOREIGN KEY ("recipient_principal_id") REFERENCES "public"."principals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
INSERT INTO "patch_visibility_policies" ("patch_id")
SELECT "id" FROM "patches"
ON CONFLICT ("patch_id") DO NOTHING;--> statement-breakpoint
CREATE INDEX "authorization_audit_events_actor_created_idx" ON "authorization_audit_events" USING btree ("actor_principal_id","created_at");--> statement-breakpoint
CREATE INDEX "authorization_audit_events_patch_created_idx" ON "authorization_audit_events" USING btree ("patch_id","created_at");--> statement-breakpoint
CREATE INDEX "authorization_audit_events_type_created_idx" ON "authorization_audit_events" USING btree ("event_type","created_at");--> statement-breakpoint
CREATE INDEX "patch_claim_quota_records_principal_attempt_idx" ON "patch_claim_quota_records" USING btree ("principal_id","attempted_at");--> statement-breakpoint
CREATE INDEX "patch_claim_quota_records_principal_outcome_idx" ON "patch_claim_quota_records" USING btree ("principal_id","outcome","attempted_at");--> statement-breakpoint
CREATE INDEX "pending_ownership_transfers_patch_status_idx" ON "pending_ownership_transfers" USING btree ("patch_id","status");--> statement-breakpoint
CREATE INDEX "pending_ownership_transfers_recipient_status_idx" ON "pending_ownership_transfers" USING btree ("recipient_principal_id","status");--> statement-breakpoint
ALTER TABLE "external_principal_mappings" ADD CONSTRAINT "external_principal_mappings_principal_id_unique" UNIQUE("principal_id");--> statement-breakpoint
ALTER TABLE "principals" ADD CONSTRAINT "principals_status_check" CHECK ("principals"."status" in ('active', 'disabled', 'deletion_pending', 'deleted'));--> statement-breakpoint
ALTER TABLE "principals" ADD CONSTRAINT "principals_deletion_timeline_check" CHECK (("principals"."status" not in ('deletion_pending', 'deleted') or "principals"."deletion_requested_at" is not null)
        and ("principals"."status" <> 'deletion_pending' or "principals"."deletion_recovery_deadline" is not null)
        and ("principals"."status" <> 'deleted' or "principals"."deletion_completed_at" is not null));