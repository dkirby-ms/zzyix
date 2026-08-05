---
title: UX Visual Redesign Prompt Updates
description: Tracking record for the UX visual redesign prompt
ms.date: 2026-08-04
ms.topic: reference
keywords:
  - ux design
  - visual redesign
  - prompt engineering
---

## Purpose

Create a workspace-scoped prompt that directs a UX designer agent to produce a visual-only
redesign proposal for the Zzyix client.

## Requirements

* Preserve product functionality, workflows, interactions, accessible semantics, Vite, React,
  and the current component and application architecture.
* Resolve every supplied GitHub issue in `dkirby-ms/zzyix` and map its visual requirements to
  design constraints before a final proposal.
* Stop with a blocked status and request pasted issue text when a supplied issue is inaccessible,
  unless the user explicitly requests an issue-independent concept brief.
* Require implementation and test inspection before recommendations.
* Separate observations from assumptions.
* Require design direction, responsive layouts, state coverage, tokens, component redlines, a
  visual-only implementation plan, an issue-to-design traceability table, and a measurable visual
  validation matrix.
* Prohibit workflow, functional, backend, API, domain, Vite or React, architecture,
  component-boundary, and interaction changes.
* Preserve labels in implementation while allowing non-binding out-of-scope content observations.
* Ground the prompt in the supplied UX designer redesign research.
* Identify each completed proposal and require explicit approval of that proposal before accepting a
  separately requested implementation task.

## Related Files

* `.github/prompts/ux-visual-redesign.prompt.md`
* `.github/agents/ux-designer.agent.md`
* `.copilot-tracking/research/2026-08-04/ux-designer-redesign-research.md`
* `.copilot-tracking/sandbox/2026-08-04-ux-visual-redesign-001/evaluation-log.md`
* `apps/client/src/App.tsx`
* `apps/client/src/App.test.tsx`
* `apps/client/package.json`

## Plan

1. Completed: review prompt-builder, writing-style, Markdown, research, evaluation, and existing
  prompt context.
2. Completed: create a workspace `UX Designer` agent and delegate the prompt to it.
3. Completed: make issue retrieval conditional on GitHub access, scope it to `dkirby-ms/zzyix`,
  and add a blocking pasted-text fallback.
4. Completed: require issue-to-design traceability before a final proposal.
5. Completed: define visual validation at 1440x900, 1024x768, and 390x844 with named states,
  contrast pairs, and screenshot or manual-inspection evidence.
6. Completed: preserve labels in implementation and isolate non-binding content observations.
7. Completed: validate frontmatter, Markdown structure, and whitespace.
8. Completed: add proposal identification and an explicit approval request before implementation
  work can be accepted.

## Modifications and Reasoning

* Created `.github/agents/ux-designer.agent.md` with a visual-design-only protocol. The agent
  blocks the proposal when any supplied issue cannot be retrieved and issue-independent work has
  not been authorized.
* Added `agent: UX Designer` to the prompt frontmatter. The prompt now provides the narrow
  Zzyix-specific inputs and requirements while inheriting the agent's workflow.
* Defined `dkirby-ms/zzyix` as the issue repository scope and conditional GitHub retrieval. The
  fallback requests pasted issue text rather than inferring issue requirements.
* Required an issue-to-design traceability table before final proposals so each extracted visual
  constraint maps to a design section or an explicit conflict decision.
* Required a visual validation matrix at 1440x900, 1024x768, and 390x844, including named states,
  exact contrast pairs and ratios, and screenshot or manual-inspection evidence.
* Kept labels unchanged in implementation recommendations. Potential label or content concerns are
  limited to a non-binding out-of-scope observations section.
* Reaffirmed visual-only boundaries that exclude functional, backend, API, domain, Vite or React,
  architecture, component-boundary, and interaction changes.
* Required every completed proposal to include a version or artifact identifier. The response now
  explicitly asks the user to approve that identified proposal before accepting separately
  requested implementation work.

## Validation

* Completed: `git diff --check` reports no whitespace errors for the prompt, agent, and tracking
  record.
* Completed: editor diagnostics report no errors for the prompt, agent, or tracking record.
* Completed: editor diagnostics report no errors after adding the proposal approval gate.
* Skipped: `markdownlint-cli2` was not installed because the user declined the one-time `npx`
  package download.

## Remaining Issues

* The active GitHub access mechanism remains environment-dependent by design. The workflow now has
  a deterministic fallback and block condition.
* Markdownlint validation remains unavailable without installing `markdownlint-cli2`.

## Questions

* None. The prompt permits an issue-independent concept brief only when the user explicitly asks
  for it.