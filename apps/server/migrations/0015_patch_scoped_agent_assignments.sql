ALTER TABLE "agent_control"."agent_assignments"
  ADD COLUMN "patch_id" uuid;
--> statement-breakpoint

UPDATE "agent_control"."agent_assignments" AS assignment
SET "patch_id" = scoped_patch."patch_id"
FROM (
  SELECT patch."quilt_id", patch."id" AS "patch_id"
  FROM "public"."patches" AS patch
  WHERE (
    SELECT count(*)
    FROM "public"."patches" AS sibling
    WHERE sibling."quilt_id" = patch."quilt_id"
  ) = 1
) AS scoped_patch
WHERE assignment."quilt_id" = scoped_patch."quilt_id";
--> statement-breakpoint

ALTER TABLE "agent_control"."agent_assignments"
  ADD CONSTRAINT "agent_control_agent_assignments_patch_id_patches_id_fk"
  FOREIGN KEY ("patch_id") REFERENCES "public"."patches"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

DROP INDEX "agent_control"."agent_control_agent_assignments_quilt_id_unique";
--> statement-breakpoint
DROP INDEX "agent_control"."agent_control_agent_assignments_agent_principal_id_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX "agent_control_agent_assignments_patch_agent_unique"
  ON "agent_control"."agent_assignments" USING btree ("patch_id", "agent_principal_id")
  WHERE "patch_id" IS NOT NULL;