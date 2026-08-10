---
title: Alexander Click-to-Patch Placement Log
description: Planning decisions for the local patch-targeted Alexander placement workflow
ms.date: 2026-08-09
ms.topic: plan
---
<!-- markdownlint-disable-file -->
# Planning Log: Alexander Click-to-Patch Placement

## Selected Path

The tool binds the local manifest to the user-owned canonical patch rather than
an arbitrary rectangle. This preserves ownership and cursor constraints while
allowing one canvas click to choose the deployment location.

## Artifact Decision

The manifest remains ignored because it is generated evidence. A reproducible
local command copies it to the client public directory for local browser use.
Publication policy remains a separate release decision.

## Deferred Work

Cross-patch placement, arbitrary scaling, agent-owned placement authority, and
release artifact publication are outside this v1.