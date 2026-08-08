ALTER TABLE "agent_control"."trigger_queue"
  ADD COLUMN "claimed_by_agent_principal_id" uuid;
--> statement-breakpoint

ALTER TABLE "agent_control"."trigger_queue"
  ADD CONSTRAINT "agent_control_trigger_queue_claimed_by_agent_principal_id_fk"
  FOREIGN KEY ("claimed_by_agent_principal_id")
  REFERENCES "public"."principals"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "agent_control"."trigger_queue_limits"
  ADD COLUMN "claim_timeout_seconds" integer DEFAULT 60 NOT NULL;
--> statement-breakpoint

ALTER TABLE "agent_control"."trigger_queue_limits"
  ADD CONSTRAINT "agent_control_trigger_queue_limits_claim_timeout_check"
  CHECK ("claim_timeout_seconds" > 0);
--> statement-breakpoint

CREATE INDEX "agent_control_trigger_queue_claim_recovery_idx"
  ON "agent_control"."trigger_queue" USING btree ("status", "claimed_at");
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
  WHERE singleton_key = 'default'
  FOR UPDATE;

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

GRANT USAGE ON SCHEMA "agent_control" TO agent_control_worker;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "agent_control" TO agent_control_worker;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA "agent_control" TO agent_control_worker;