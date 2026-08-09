---
title: Agent Worker README Work Plan Research
status: complete
date: 2026-08-08
---

## Research Topics

* Prioritize discovered documentation issues for apps/agent-worker/README.md.
* Scope the work plan to README edits only, excluding nearby architecture documents.

## Evidence Reviewed

* .copilot-tracking/doc-ops/2026-08-08-session.md lists pattern compliance, accuracy discrepancy, and missing documentation findings.
* apps/agent-worker/README.md currently describes the worker as a read-only MVP prototype with minimal test and run instructions.

## Key Discoveries

* Accuracy discrepancies are the highest-priority group because the README understates implemented behavior, omits required runtime configuration, and contains ambiguous or contradictory authentication guidance.
* Missing user-facing operations guidance is the second-priority group because operators need prerequisites, configuration tables, run behavior, recovery, read-tool behavior, and observability guidance to deploy or troubleshoot the worker.
* Pattern compliance is lower priority but still required because the README is missing YAML frontmatter and should avoid a duplicate H1 when a frontmatter title is added.

## Clarifying Questions

* None. The session file provides enough source issues to create the requested work plan.

## Status

Complete.