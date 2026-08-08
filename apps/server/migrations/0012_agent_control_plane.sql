CREATE SCHEMA IF NOT EXISTS "agent_control";
--> statement-breakpoint

CREATE TABLE "agent_control"."agent_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quilt_id" uuid NOT NULL,
	"agent_principal_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"policy_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_control_agent_assignments_status_check" CHECK ("agent_control"."agent_assignments"."status" in ('active', 'paused', 'disabled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "agent_control_agent_assignments_quilt_id_unique" ON "agent_control"."agent_assignments" USING btree ("quilt_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "agent_control_agent_assignments_agent_principal_id_unique" ON "agent_control"."agent_assignments" USING btree ("agent_principal_id");
--> statement-breakpoint
ALTER TABLE "agent_control"."agent_assignments" ADD CONSTRAINT "agent_control_agent_assignments_quilt_id_quilts_id_fk" FOREIGN KEY ("quilt_id") REFERENCES "public"."quilts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_control"."agent_assignments" ADD CONSTRAINT "agent_control_agent_assignments_agent_principal_id_principals_id_fk" FOREIGN KEY ("agent_principal_id") REFERENCES "public"."principals"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint

CREATE TABLE "agent_control"."lifecycle_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quilt_id" uuid NOT NULL,
	"agent_principal_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "agent_control_lifecycle_events_quilt_created_idx" ON "agent_control"."lifecycle_events" USING btree ("quilt_id","created_at");
--> statement-breakpoint
ALTER TABLE "agent_control"."lifecycle_events" ADD CONSTRAINT "agent_control_lifecycle_events_quilt_id_quilts_id_fk" FOREIGN KEY ("quilt_id") REFERENCES "public"."quilts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_control"."lifecycle_events" ADD CONSTRAINT "agent_control_lifecycle_events_agent_principal_id_principals_id_fk" FOREIGN KEY ("agent_principal_id") REFERENCES "public"."principals"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint

CREATE TABLE "agent_control"."runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quilt_id" uuid NOT NULL,
	"agent_principal_id" uuid NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "agent_control_runs_status_check" CHECK ("agent_control"."runs"."status" in ('running', 'succeeded', 'failed', 'cancelled')),
	CONSTRAINT "agent_control_runs_completion_check" CHECK (("agent_control"."runs"."status" = 'running' and "agent_control"."runs"."ended_at" is null)
		or ("agent_control"."runs"."status" <> 'running' and "agent_control"."runs"."ended_at" is not null))
);
--> statement-breakpoint
CREATE INDEX "agent_control_runs_quilt_status_started_idx" ON "agent_control"."runs" USING btree ("quilt_id","status","started_at");
--> statement-breakpoint
ALTER TABLE "agent_control"."runs" ADD CONSTRAINT "agent_control_runs_quilt_id_quilts_id_fk" FOREIGN KEY ("quilt_id") REFERENCES "public"."quilts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_control"."runs" ADD CONSTRAINT "agent_control_runs_agent_principal_id_principals_id_fk" FOREIGN KEY ("agent_principal_id") REFERENCES "public"."principals"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint

CREATE TABLE "agent_control"."quilt_leases" (
	"quilt_id" uuid PRIMARY KEY NOT NULL,
	"lease_owner_principal_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"generation" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "agent_control_quilt_leases_generation_check" CHECK ("agent_control"."quilt_leases"."generation" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "agent_control_quilt_leases_run_id_unique" ON "agent_control"."quilt_leases" USING btree ("run_id");
--> statement-breakpoint
CREATE INDEX "agent_control_quilt_leases_expiry_idx" ON "agent_control"."quilt_leases" USING btree ("expires_at");
--> statement-breakpoint
ALTER TABLE "agent_control"."quilt_leases" ADD CONSTRAINT "agent_control_quilt_leases_quilt_id_quilts_id_fk" FOREIGN KEY ("quilt_id") REFERENCES "public"."quilts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_control"."quilt_leases" ADD CONSTRAINT "agent_control_quilt_leases_lease_owner_principal_id_principals_id_fk" FOREIGN KEY ("lease_owner_principal_id") REFERENCES "public"."principals"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_control"."quilt_leases" ADD CONSTRAINT "agent_control_quilt_leases_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "agent_control"."runs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

CREATE TABLE "agent_control"."checkpoints" (
	"quilt_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"checkpoint_version" integer DEFAULT 1 NOT NULL,
	"workflow_state" text NOT NULL,
	"observed_revision" integer,
	"pending_trigger_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"policy_version" text NOT NULL,
	"framework_version" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_control_checkpoints_pk" PRIMARY KEY("quilt_id","run_id"),
	CONSTRAINT "agent_control_checkpoints_version_check" CHECK ("agent_control"."checkpoints"."checkpoint_version" > 0),
	CONSTRAINT "agent_control_checkpoints_pending_trigger_ids_check" CHECK (jsonb_typeof("agent_control"."checkpoints"."pending_trigger_ids") = 'array')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "agent_control_checkpoints_run_id_unique" ON "agent_control"."checkpoints" USING btree ("run_id");
--> statement-breakpoint
ALTER TABLE "agent_control"."checkpoints" ADD CONSTRAINT "agent_control_checkpoints_quilt_id_quilts_id_fk" FOREIGN KEY ("quilt_id") REFERENCES "public"."quilts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_control"."checkpoints" ADD CONSTRAINT "agent_control_checkpoints_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "agent_control"."runs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

CREATE TABLE "agent_control"."trigger_queue_limits" (
	"singleton_key" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"pending_limit" integer DEFAULT 500 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_control_trigger_queue_limits_singleton_check" CHECK ("agent_control"."trigger_queue_limits"."singleton_key" = 'default'),
	CONSTRAINT "agent_control_trigger_queue_limits_pending_limit_check" CHECK ("agent_control"."trigger_queue_limits"."pending_limit" > 0)
);
--> statement-breakpoint
INSERT INTO "agent_control"."trigger_queue_limits" ("singleton_key", "pending_limit")
VALUES ('default', 500)
ON CONFLICT ("singleton_key") DO NOTHING;
--> statement-breakpoint

CREATE TABLE "agent_control"."trigger_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"quilt_id" uuid NOT NULL,
	"deduplication_key" text NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"coalescing_policy_version" text NOT NULL,
	"payload" jsonb NOT NULL,
	"run_id" uuid,
	"claimed_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_control_trigger_queue_status_check" CHECK ("agent_control"."trigger_queue"."status" in ('pending', 'claimed', 'completed', 'failed', 'dropped')),
	CONSTRAINT "agent_control_trigger_queue_priority_check" CHECK ("agent_control"."trigger_queue"."priority" >= 0 and "agent_control"."trigger_queue"."priority" <= 1000)
);
--> statement-breakpoint
CREATE INDEX "agent_control_trigger_queue_quilt_status_priority_created_idx" ON "agent_control"."trigger_queue" USING btree ("quilt_id","status","priority","created_at");
--> statement-breakpoint
CREATE INDEX "agent_control_trigger_queue_status_created_idx" ON "agent_control"."trigger_queue" USING btree ("status","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "agent_control_trigger_queue_active_dedup_idx" ON "agent_control"."trigger_queue" USING btree ("quilt_id","deduplication_key") WHERE "status" in ('pending', 'claimed');
--> statement-breakpoint
ALTER TABLE "agent_control"."trigger_queue" ADD CONSTRAINT "agent_control_trigger_queue_quilt_id_quilts_id_fk" FOREIGN KEY ("quilt_id") REFERENCES "public"."quilts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_control"."trigger_queue" ADD CONSTRAINT "agent_control_trigger_queue_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "agent_control"."runs"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint

CREATE TABLE "agent_control"."tool_call_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"tool_name" text NOT NULL,
	"outcome" text NOT NULL,
	"latency_ms" integer,
	"output_metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "agent_control_tool_call_outcomes_run_created_idx" ON "agent_control"."tool_call_outcomes" USING btree ("run_id","created_at");
--> statement-breakpoint
ALTER TABLE "agent_control"."tool_call_outcomes" ADD CONSTRAINT "agent_control_tool_call_outcomes_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "agent_control"."runs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

CREATE TABLE "agent_control"."model_call_metadata" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"request_id" text,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"latency_ms" integer,
	"safety_outcome" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "agent_control_model_call_metadata_run_created_idx" ON "agent_control"."model_call_metadata" USING btree ("run_id","created_at");
--> statement-breakpoint
ALTER TABLE "agent_control"."model_call_metadata" ADD CONSTRAINT "agent_control_model_call_metadata_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "agent_control"."runs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

CREATE TABLE "agent_control"."lifecycle_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quilt_id" uuid,
	"run_id" uuid,
	"agent_principal_id" uuid,
	"event_type" text NOT NULL,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "agent_control_lifecycle_audit_quilt_created_idx" ON "agent_control"."lifecycle_audit" USING btree ("quilt_id","created_at");
--> statement-breakpoint
ALTER TABLE "agent_control"."lifecycle_audit" ADD CONSTRAINT "agent_control_lifecycle_audit_quilt_id_quilts_id_fk" FOREIGN KEY ("quilt_id") REFERENCES "public"."quilts"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_control"."lifecycle_audit" ADD CONSTRAINT "agent_control_lifecycle_audit_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "agent_control"."runs"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_control"."lifecycle_audit" ADD CONSTRAINT "agent_control_lifecycle_audit_agent_principal_id_principals_id_fk" FOREIGN KEY ("agent_principal_id") REFERENCES "public"."principals"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION "agent_control"."enforce_pending_trigger_limit"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	configured_limit integer;
	pending_count integer;
BEGIN
	IF NEW.status <> 'pending' THEN
		RETURN NEW;
	END IF;

	SELECT pending_limit
	INTO configured_limit
	FROM "agent_control"."trigger_queue_limits"
	WHERE singleton_key = 'default';

	SELECT count(*)
	INTO pending_count
	FROM "agent_control"."trigger_queue"
	WHERE status = 'pending';

	IF pending_count >= configured_limit THEN
		RAISE EXCEPTION 'pending trigger queue limit exceeded (limit=%)', configured_limit;
	END IF;

	RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER "agent_control_trigger_queue_pending_limit_trg"
BEFORE INSERT ON "agent_control"."trigger_queue"
FOR EACH ROW
EXECUTE FUNCTION "agent_control"."enforce_pending_trigger_limit"();
--> statement-breakpoint

DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agent_control_worker') THEN
		CREATE ROLE agent_control_worker;
	END IF;
END
$$;
--> statement-breakpoint

GRANT USAGE ON SCHEMA "agent_control" TO agent_control_worker;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "agent_control" TO agent_control_worker;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA "agent_control"
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO agent_control_worker;
--> statement-breakpoint

REVOKE ALL ON SCHEMA "public" FROM agent_control_worker;
--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA "public" FROM agent_control_worker;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA "public"
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLES FROM agent_control_worker;