---
title: Monitoring and Observability Implementation Planning Research
description: Verified implementation context and phased recommendation for hybrid OpenTelemetry with an Azure sink
author: GitHub Copilot
ms.date: 2026-08-03
ms.topic: reference
keywords:
  - monitoring
  - observability
  - opentelemetry
  - azure monitor
---

## Research Questions

* Which current code paths own server telemetry, client telemetry, correlation, health, and deployment configuration?
* Which exact files, tests, package scripts, and dependencies would an implementation affect?
* Which Bicep module conventions and deployment configuration flows constrain the implementation?
* Do monitoring or observability plans already exist under `.copilot-tracking/plans` or `.copilot-tracking/details`?
* What phased implementation is actionable for hybrid OpenTelemetry instrumentation with an Azure sink?
* Is an in-repository OpenTelemetry Collector deployment justified now?
* Which precise commands validate each implementation phase?

## Working Hypothesis

The repository can adopt OpenTelemetry APIs and Azure Monitor export directly in the application tier while preserving its typed telemetry events. An in-repository Collector deployment is justified only if current topology, processing, routing, or resiliency requirements cannot be met by direct export.

The cheapest disconfirming check is whether the current Bicep and deployment flow already has a separately managed runtime suitable for a Collector, or whether requirements demand centralized transformations, fan-out, or durable buffering.

## Findings

Research in progress.

## Phased Implementation Recommendation

Research in progress.

## Validation Commands

Research in progress.

## Unresolved Gaps

Research in progress.

## Clarifying Questions

Research in progress.

## Evidence

Research in progress.