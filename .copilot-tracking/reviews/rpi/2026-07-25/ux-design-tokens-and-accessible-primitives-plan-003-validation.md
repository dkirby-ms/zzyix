---
title: RPI Validation Phase 3 UX Design Tokens and Accessible Primitives
description: Validation of Implementation Phase 3 against plan, changes log, research requirements, and repository evidence
ms.date: 2026-07-25
ms.topic: how-to
---

## Validation Scope

Validated only Implementation Phase 3: Existing UI Migration and Accessibility Hardening.

Inputs used:

* Plan: /home/saitcho/zzyix/.copilot-tracking/plans/2026-07-25/ux-design-tokens-and-accessible-primitives-plan.instructions.md
* Changes: /home/saitcho/zzyix/.copilot-tracking/changes/2026-07-25/ux-design-tokens-and-accessible-primitives-changes.md
* Research: /home/saitcho/zzyix/.copilot-tracking/research/2026-07-25/ux-design-tokens-research.md

## Phase Status

needs rework

## Requirement Coverage

### Step 3.1 Semantic-token migration

Status: partial

Evidence:

* Plan Phase 3 Step 3.1 marked complete in /home/saitcho/zzyix/.copilot-tracking/plans/2026-07-25/ux-design-tokens-and-accessible-primitives-plan.instructions.md:80
* Changes claim migration in /home/saitcho/zzyix/.copilot-tracking/changes/2026-07-25/ux-design-tokens-and-accessible-primitives-changes.md:41-45
* StatusIndicator migration is implemented with semantic status tokens in /home/saitcho/zzyix/apps/client/src/ui/StatusIndicator.css:31-87 and token definitions in /home/saitcho/zzyix/apps/client/src/styles/tokens/semantic.css:14-35
* App.css still contains numerous hardcoded color literals, for example in /home/saitcho/zzyix/apps/client/src/App.css:249, /home/saitcho/zzyix/apps/client/src/App.css:288, /home/saitcho/zzyix/apps/client/src/App.css:413-414, /home/saitcho/zzyix/apps/client/src/App.css:431, /home/saitcho/zzyix/apps/client/src/App.css:437

### Step 3.2 Focus visibility and 44x44 touch targets

Status: mostly complete with one major accessibility gap

Evidence:

* Touch target minimum is implemented in /home/saitcho/zzyix/apps/client/src/App.css:237-238 and /home/saitcho/zzyix/apps/client/src/App.css:272-273, with token source at /home/saitcho/zzyix/apps/client/src/styles/tokens/primitives.css:64
* Focus-visible styling is implemented in /home/saitcho/zzyix/apps/client/src/App.css:258-259 and globally in /home/saitcho/zzyix/apps/client/src/styles/base.css:8-11
* Error tooltip trigger wraps a non-focusable div in /home/saitcho/zzyix/apps/client/src/ui/StatusIndicator.tsx:31 and /home/saitcho/zzyix/apps/client/src/ui/StatusIndicator.tsx:43, so keyboard users cannot reliably focus the trigger to reveal error text

### Step 3.3 Reduced motion

Status: complete

Evidence:

* Reduced-motion fallback in legacy styles is present in /home/saitcho/zzyix/apps/client/src/App.css:445-455
* Shared reduced-motion fallback is present in /home/saitcho/zzyix/apps/client/src/styles/base.css:25-33
* Component-specific reduced-motion fallback is present in /home/saitcho/zzyix/apps/client/src/ui/StatusIndicator.css:100-107

### Step 3.5 Scope guard exclusions

Status: complete

Evidence:

* Plan requires exclusion of tile picker and palette layout in /home/saitcho/zzyix/.copilot-tracking/plans/2026-07-25/ux-design-tokens-and-accessible-primitives-plan.instructions.md:88-90
* Repository changed-file set for this task contains App and status/token/primitive files only; no edits were found under domain tile geometry or palette layout targets

## Findings

### Major

1. Keyboard access gap in status error tooltip trigger

* Impact: Error details are not reliably available to keyboard users, which conflicts with accessibility hardening goals and the focus visibility requirement in research.
* Evidence:
  * Requirement in /home/saitcho/zzyix/.copilot-tracking/research/2026-07-25/ux-design-tokens-research.md:12 and /home/saitcho/zzyix/.copilot-tracking/research/2026-07-25/ux-design-tokens-research.md:23
  * Non-focusable trigger wrapper in /home/saitcho/zzyix/apps/client/src/ui/StatusIndicator.tsx:31 and /home/saitcho/zzyix/apps/client/src/ui/StatusIndicator.tsx:43
* Recommendation: Make the tooltip trigger keyboard-focusable, for example by rendering the indicator as a button or by adding a proper focusable element with semantic role and focus styles.

### Minor

1. Semantic-token migration in App.css remains partial beyond status and focus/touch updates

* Impact: Remaining hardcoded literals increase future theming and consistency risk.
* Evidence:
  * Migration intent in /home/saitcho/zzyix/.copilot-tracking/plans/2026-07-25/ux-design-tokens-and-accessible-primitives-plan.instructions.md:80 and claims in /home/saitcho/zzyix/.copilot-tracking/changes/2026-07-25/ux-design-tokens-and-accessible-primitives-changes.md:41
  * Hardcoded values still present in /home/saitcho/zzyix/apps/client/src/App.css:249, /home/saitcho/zzyix/apps/client/src/App.css:288, /home/saitcho/zzyix/apps/client/src/App.css:413-414, /home/saitcho/zzyix/apps/client/src/App.css:431, /home/saitcho/zzyix/apps/client/src/App.css:437
* Recommendation: Continue incremental token substitution for remaining hardcoded values, prioritizing interactive and status-adjacent UI surfaces.

## Coverage Assessment

Phase 3 implementation coverage is high but not complete.

* Step 3.1: partial
* Step 3.2: partial due to keyboard trigger accessibility gap
* Step 3.3: complete
* Step 3.5: complete

Overall phase outcome: needs rework before this phase can be considered fully complete.

## Clarifying Questions

1. Should the status indicator itself become an interactive control when an error exists, or should error details also be exposed through a non-tooltip channel that is always keyboard and screen-reader reachable?
2. For Step 3.1, is the intended acceptance to migrate only status and focus/touch-related sections of App.css, or to continue broader semantic replacement in this phase?