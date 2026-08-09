<!-- markdownlint-disable-file -->
<!-- markdown-table-prettify-ignore-start -->
# Discovery - Issue Planning Log

* **Repository**: dkirby-ms/zzyix
* **Milestone**: Mosaic Agents MVP
* **Previous Phase**: Just Started
* **Current Phase**: Phase-3

## Status

Branch and issue alignment complete for Epic #172.

**Summary**: Compared current branch `agent` against `main`, hydrated Epic #172 and its 18 sub-issues, and prepared update/no-change recommendations for code already built on the branch.

## Discovered Artifacts and Related Files

* AT001 apps/agent-worker/README.md - Complete - Related
* AT002 docs/fantome-resident-agent-architecture.md - Complete - Related
* AT003 apps/agent-worker/src/control_plane.py - Complete - Related
* AT004 apps/agent-worker/src/workflow.py - Complete - Related
* AT005 apps/agent-worker/src/gateway.py - Complete - Related
* AT006 apps/agent-worker/src/tools.py - Complete - Related
* AT007 apps/server/src/routes/agentReads.ts - Complete - Related
* AT008 apps/server/src/auth/tokenVerifier.ts - Complete - Related
* AT009 apps/server/src/auth/principalContext.ts - Complete - Related
* AT010 apps/server/migrations/0012_agent_control_plane.sql - Complete - Related
* AT011 apps/server/migrations/0015_patch_scoped_agent_assignments.sql - Complete - Related
* AT012 apps/server/migrations/0016_agent_control_permissions_and_queue_guards.sql - Complete - Related
* AT013 .github/workflows/cd.yml - Complete - Related
* AT014 .github/workflows/ci.yml - Complete - Related
* AT015 docs/fantome-agent-entra-setup.md - Complete - Related
* AT016 apps/client/src/telemetry.ts - Complete - Related
* AT017 apps/client/src/config/telemetryConfig.ts - Complete - Related

## Discovered GitHub Issues

* GH-172 - Complete - Processing - Epic parent for Fantome agent design and implementation.
* GH-173 - Complete - Related - Closed architecture authority-boundary decision.
* GH-175 - Complete - Related - Open domain model and event contracts item.
* GH-176 - Complete - Related - Open quiet witness prototype item.
* GH-177 - Complete - Related - Open social interpretation prototype item.
* GH-178 - Complete - Related - Open resident distance and disengagement controls item.
* GH-179 - Complete - Related - Open mutation-protection item.
* GH-180 - Complete - Related - Open privacy-bounded memory item.
* GH-181 - Complete - Related - Open behavior tiers and cadence item.
* GH-182 - Complete - Related - Open gated historical and mythic events item.
* GH-183 - Complete - Related - Open observability and operational controls item.
* GH-184 - Complete - Related - Open multi-user and replica validation item.
* GH-185 - Complete - Related - Closed deterministic versus LLM architecture decision.
* GH-186 - Complete - Related - Closed framework and tool-boundary architecture decision.
* GH-187 - Complete - Related - Closed prompt and model policy boundary decision.
* GH-188 - Complete - Related - Closed governed gateway architecture decision.
* GH-189 - Complete - Related - Open behavior and model-output evaluation item.
* GH-190 - Complete - Related - Open production governance item.
* GH-191 - Complete - Related - Open worker runtime testing plan item.

## Issue Progress

### **IS001** - epic, agents - Complete

* IS001 - Issue Section: Epic #172 branch alignment.
* Working Search Keywords: `parent:172`, `milestone:"Mosaic Agents MVP"`, current branch diff versus `main`.
* Related GitHub Issues - Similarity: #172=Match (direct requested parent epic)
* Suggested Action: No Change

The epic remains the correct parent. Current branch work aligns to the epic but should be reflected on child issues rather than by changing the parent issue.

### **IS002** - agents, backend, runtime - Complete

* IS002 - Issue Section: Resident control plane, worker runtime, and read-only tool foundation.
* Working Search Keywords: `agent_control`, `agent worker`, `read-only tools`, `lease`, `checkpoint`, `gateway`.
* Related GitHub Issues - Similarity: #175=Similar, #178=Similar, #179=Match, #181=Similar, #183=Similar, #188=Match
* Suggested Action: Update existing issues; #188 remains No Change because it is already closed.

Implemented branch files add durable control-plane tables, lease/run/checkpoint handling, active assignment enforcement, read-only server routes, bounded tools, a framework workflow adapter, deterministic fallback behavior, and governed gateway controls.

### **IS003** - agents, security, identity - Complete

* IS003 - Issue Section: Agent identity, app-only auth, restricted role, and prompt/model boundaries.
* Working Search Keywords: `agent.runtime`, `managed identity`, `restricted worker`, `Foundry`, `prompt boundary`.
* Related GitHub Issues - Similarity: #180=Similar, #187=Match, #190=Similar
* Suggested Action: Update open governance and privacy issues; #187 remains No Change because it is already closed.

Implemented branch files separate app-only agent tokens from human delegated scopes, require active database agent principals, verify restricted database access, keep model features disabled by default, and redact telemetry/tool context.

### **IS004** - agents, qa, observability - Complete

* IS004 - Issue Section: Runtime tests, telemetry, deployment checks, and remaining validation blockers.
* Working Search Keywords: `pytest`, `AGENT_WORKER_POSTGRES_TEST_DSN`, `Application Insights`, `worker CI`, `runtime contract`.
* Related GitHub Issues - Similarity: #183=Similar, #184=Similar, #189=Similar, #190=Similar, #191=Match
* Suggested Action: Update existing issues.

The branch adds broad server and worker tests, telemetry wiring, Docker validation, CD deployment and restricted-role verification, but CI does not yet run worker pytest lanes and local PostgreSQL restart evidence remains blocked without a worker test DSN.

## GitHub Issues

### GH-172

Epic: [Epic] Fantome agent design and implementation. State: open. Milestone: Mosaic Agents MVP. Direct sub-issues: #173, #175-#191.

### GH-191

Open work item for implementing the agent worker runtime testing plan. Current branch partially satisfies runtime testing and documentation goals, but leaves CI worker lanes and non-skipped PostgreSQL restart evidence unresolved.
<!-- markdown-table-prettify-ignore-end -->