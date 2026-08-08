CREATE OR REPLACE FUNCTION "agent_control"."enforce_pending_trigger_limit"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  configured_limit integer;
  pending_count integer;
BEGIN
  IF NEW.status <> 'pending' OR (TG_OP = 'UPDATE' AND OLD.status = 'pending') THEN
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

DROP TRIGGER "agent_control_trigger_queue_pending_limit_trg"
ON "agent_control"."trigger_queue";
--> statement-breakpoint

CREATE TRIGGER "agent_control_trigger_queue_pending_limit_trg"
BEFORE INSERT OR UPDATE OF "status" ON "agent_control"."trigger_queue"
FOR EACH ROW
EXECUTE FUNCTION "agent_control"."enforce_pending_trigger_limit"();
--> statement-breakpoint

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA "agent_control" FROM agent_control_worker;
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA "agent_control" FROM agent_control_worker;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA "agent_control"
REVOKE ALL ON TABLES FROM agent_control_worker;
--> statement-breakpoint

GRANT USAGE ON SCHEMA "agent_control" TO agent_control_worker;
--> statement-breakpoint
GRANT SELECT ON "agent_control"."agent_assignments", "agent_control"."trigger_queue_limits" TO agent_control_worker;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "agent_control"."runs", "agent_control"."checkpoints" TO agent_control_worker;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "agent_control"."quilt_leases" TO agent_control_worker;
--> statement-breakpoint
GRANT SELECT, UPDATE ON "agent_control"."trigger_queue" TO agent_control_worker;
--> statement-breakpoint
GRANT INSERT ON "agent_control"."tool_call_outcomes", "agent_control"."model_call_metadata", "agent_control"."lifecycle_audit" TO agent_control_worker;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA "agent_control" TO agent_control_worker;