---
title: Observability SLO Policy
description: Release telemetry evidence, SLO targets, and cost guardrails for monitoring and observability
ms.date: 2026-08-03
ms.topic: concept
keywords: [observability, telemetry, slo, azure monitor, application insights]
---

## Status

Accepted for implementation with 90-day validation tracking.

## Context

This policy defines release telemetry evidence requirements and SLO guardrails for the
monitoring and observability implementation in GitHub issue #135. It aligns with
research recommendations documented in
.copilot-tracking/research/2026-08-03/monitoring-and-observability-research.md and with
existing architecture decisions for operational budget management.

## Telemetry gate evidence

Before release approval, the deployment must provide:

* Trace coverage evidence for at least 90% of critical server paths.
* Log correlation evidence showing trace IDs on server logs produced through writeLog.
* Health endpoint readiness evidence showing dependency checks, including database status.
* Deployment evidence that Application Insights connection configuration is present in CD
  environment variables.

## SLO targets

Initial targets apply for the first 90 days and are validated after production telemetry
stabilizes.

* Telemetry pipeline drop rate for critical sampled events: below 1%.
* Trace and log correlation coverage on canonical server paths: at least 90%.
* Dashboard utility: key interaction regressions are diagnosable within 15 minutes using
  combined metrics and traces.
* Monthly ingestion cost variance: stays within the approved budget threshold (TBD by
  platform owner).

## Retention policy

The baseline Log Analytics retention remains 30 days. If SLO evidence requires deeper
historical debugging, retention may be increased to 90 days through a follow-on
infrastructure update and cost review.

## Out of scope

This policy does not define paging, alert routing, or on-call workflow automation. Those
activities are deferred to follow-on work item WI-02.

## Owner matrix

* Server telemetry ownership: server team.
* Client telemetry ownership: client team.
* Infrastructure and cost governance ownership: platform team.

## Review cadence

* Weekly telemetry quality review during rollout.
* Monthly cost and retention review with platform owner.
* 90-day formal SLO assessment with update decision for thresholds and policy revisions.
