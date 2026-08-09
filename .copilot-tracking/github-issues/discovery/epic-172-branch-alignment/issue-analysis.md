<!-- markdownlint-disable-file -->
<!-- markdown-table-prettify-ignore-start -->
# Discovery Issue Analysis - Epic 172 Branch Alignment

* **Artifact(s)**: Current branch `agent` diff against `main`; Epic #172 and direct sub-issues #173, #175-#191
* **Repository**: dkirby-ms/zzyix
* **Milestone**: Mosaic Agents MVP

## Planned Issues

### IS001 - No Change - Keep Epic #172 as the implementation parent

* **Working Title**: [Epic] Fantome agent design and implementation
* **Key Search Terms**: `parent:172`, `Mosaic Agents MVP`, `Fantome agent`
* **Working Description**:
  ```markdown
  Keep Epic #172 unchanged as the parent tracker. Current branch work should be reflected on child issues because the epic already owns the Fantome design and implementation scope.
  ```
* **Working Labels**: none
* **Working Milestone**: Mosaic Agents MVP
* **Found Issue Field Values**:
  * state: open
  * milestone: Mosaic Agents MVP
  * sub-issues: #173, #175, #176, #177, #178, #179, #180, #181, #182, #183, #184, #185, #186, #187, #188, #189, #190, #191
* **Suggested Issue Field Values**:
  * action: No Change

#### IS001 - Related and Discovered Information

* Related codebase items:
  * Current branch implements a read-only worker MVP and supporting deployment/runtime surfaces rather than a complete product-facing resident behavior release.

### IS002 - Update - Align resident control-plane and runtime foundation

* **Working Title**: feat(agents): align resident runtime foundation with implemented worker MVP
* **Key Search Terms**: `agent_control`, `lease`, `checkpoint`, `read-only tools`, `governed gateway`
* **Working Description**:
  ```markdown
  Update the relevant child issues to record the branch implementation of the durable PostgreSQL control plane, Python worker supervisor, explicit Agent Framework workflow, read-only tool surface, bounded gateway, and canonical server authority boundaries.
  ```
* **Working Labels**: area:backend, area:devops, area:security
* **Working Milestone**: Mosaic Agents MVP
* **Found Issue Field Values**:
  * #175 state: open
  * #178 state: open
  * #179 state: open
  * #181 state: open
  * #188 state: closed
* **Suggested Issue Field Values**:
  * #175 action: Update with implemented control-plane/domain/event contract evidence
  * #178 action: Update with server-side gating, feature gates, lease-loss stop behavior, and requeue evidence
  * #179 action: Update and consider close after review because the MVP is intentionally read-only and cannot mutate canonical quilt state
  * #181 action: Update with trigger claiming, run serialization, lease renewal, requeue, bounded gateway, and default model-free gate evidence
  * #188 action: No Change because the architecture decision is closed and the branch implements it

#### IS002 - Related and Discovered Information

* Related codebase items:
  * `apps/server/migrations/0012_agent_control_plane.sql` adds the agent control-plane schema, leases, runs, checkpoints, triggers, and restricted role model.
  * `apps/server/migrations/0015_patch_scoped_agent_assignments.sql` and `0016_agent_control_permissions_and_queue_guards.sql` add assignment and queue guard hardening.
  * `apps/agent-worker/src/control_plane.py` implements in-memory and PostgreSQL control-plane adapters.
  * `apps/agent-worker/src/supervisor.py` owns trigger polling, lease handling, recovery, and run outcome transitions.
  * `apps/agent-worker/src/workflow.py` implements the explicit framework workflow and read-only proposal path.
  * `apps/agent-worker/src/gateway.py` implements deterministic fallback and governed provider constraints.
  * `apps/server/src/routes/agentReads.ts` adds bounded internal read endpoints with assignment checks and authorization audit writes.

### IS003 - Update - Align security, identity, privacy, and production governance

* **Working Title**: security(agents): align agent identity and governance implementation with epic backlog
* **Key Search Terms**: `agent.runtime`, `managed identity`, `restricted worker`, `redacted telemetry`, `Foundry gate`
* **Working Description**:
  ```markdown
  Update privacy, prompt-boundary, and production-governance issues with implemented app-only auth, active agent principal resolution, restricted control-plane DSN verification, redacted telemetry, default-disabled Foundry gates, and deployment runbook evidence.
  ```
* **Working Labels**: area:security, area:devops
* **Working Milestone**: Mosaic Agents MVP
* **Found Issue Field Values**:
  * #180 state: open
  * #187 state: closed
  * #190 state: open
* **Suggested Issue Field Values**:
  * #180 action: Update as partial; memory remains disabled and privacy foundations exist, but creative memory is not implemented
  * #187 action: No Change because the policy decision is already closed
  * #190 action: Update with deployment governance, Entra/RBAC runbook, restricted-role verifier, telemetry, and remaining production activation prerequisites

#### IS003 - Related and Discovered Information

* Related codebase items:
  * `apps/server/src/auth/tokenVerifier.ts` separates app-role tokens from delegated human scopes.
  * `apps/server/src/auth/principalContext.ts` resolves active pre-provisioned agent principals.
  * `apps/agent-worker/src/identity.py` acquires managed-identity tokens for server and Foundry scopes.
  * `apps/agent-worker/src/control_plane_access_verification.py` verifies the restricted worker DSN cannot write canonical quilt tables.
  * `docs/fantome-agent-entra-setup.md` documents Entra ID and Azure RBAC activation.
  * `.github/workflows/cd.yml` builds/deploys the worker image and runs post-deploy restricted-role verification.

### IS004 - Update - Align testing, observability, and validation backlog

* **Working Title**: test(agents): align worker validation and observability with branch evidence
* **Key Search Terms**: `pytest`, `worker CI`, `PostgreSQL restart`, `Application Insights`, `telemetry`
* **Working Description**:
  ```markdown
  Update the QA, observability, production governance, and worker runtime testing issues with current validation evidence and remaining blockers. The branch adds substantial unit/integration coverage and telemetry wiring, but still lacks CI worker pytest lanes and non-skipped PostgreSQL restart evidence.
  ```
* **Working Labels**: area:qa, area:devops
* **Working Milestone**: Mosaic Agents MVP
* **Found Issue Field Values**:
  * #183 state: open
  * #184 state: open
  * #189 state: open
  * #190 state: open
  * #191 state: open
* **Suggested Issue Field Values**:
  * #183 action: Update with worker/server telemetry, Application Insights wiring, restricted verifier, feature gates, and kill-switch-like deployment flags
  * #184 action: Update with multi-replica and restart/reconnect validation evidence, but keep open for resident behavior validation across users and replicas
  * #189 action: Update as partial; gateway fallback and output-shape tests exist, but model-output evaluation is not complete
  * #190 action: Update with operational telemetry and deployment governance evidence
  * #191 action: Update with completed worker test layers and explicit remaining CI/PostgreSQL blockers

#### IS004 - Related and Discovered Information

* Related codebase items:
  * `apps/agent-worker/tests/` contains worker tests for checkpoints, gateway, identity, tools, workflow, supervisor, telemetry, access verification, and PostgreSQL-gated control-plane behavior.
  * `.github/workflows/ci.yml` still contains only client/server test/build jobs and no worker pytest job.
  * `apps/client/src/telemetry.ts` and `apps/client/src/config/telemetryConfig.ts` add client Application Insights initialization.
  * `apps/server/src/telemetry.ts` adds worker-read and server telemetry support.
  * Current implementation notes report `pytest` and `AGENT_WORKER_POSTGRES_TEST_DSN` as remaining local validation blockers.

### IS005 - No Change - Keep product-facing prototype and historical-event items open

* **Working Title**: feat(agents): keep product-facing resident behavior issues open
* **Key Search Terms**: `quiet witness`, `social interpretation`, `historical events`, `resident marks`
* **Working Description**:
  ```markdown
  The current branch implements infrastructure and read-only worker foundations, not the quiet witness UI/product prototype, social interpretation experience, or historical and mythic resident event behavior.
  ```
* **Working Labels**: area:frontend, area:backend
* **Working Milestone**: Mosaic Agents MVP
* **Found Issue Field Values**:
  * #176 state: open
  * #177 state: open
  * #182 state: open
* **Suggested Issue Field Values**:
  * #176 action: No Change
  * #177 action: No Change
  * #182 action: No Change

#### IS005 - Related and Discovered Information

* Related codebase items:
  * No current branch files implement user-visible resident marks, comments, interpretation UI, or curated historical event activation.
<!-- markdown-table-prettify-ignore-end -->