---
description: "Creates a visual-only UX redesign proposal that preserves Zzyix behavior and architecture"
agent: UX Designer
argument-hint: "[issues=<URL, #number, or list>] [focus=...]"
---

# UX Visual Redesign

## Inputs

* ${input:issues:}: (Optional) GitHub issue URL, issue number, or comma-separated list of
  either. Resolve every supplied issue in `dkirby-ms/zzyix` before a final proposal.
* ${input:focus:}: (Optional) Specific screen, breakpoint, or visual concern to prioritize.

## Requirements

Use the `UX Designer` workflow. It applies GitHub access only when issues are supplied and access
is available. When an issue cannot be retrieved, request its pasted text and stop with a blocked
status unless the user explicitly requests an issue-independent concept brief.

Ground the proposal in
`.copilot-tracking/research/2026-08-04/ux-designer-redesign-research.md`. Use the research to
retain the canvas-first collaborative craft experience while considering the current visual
treatment open to refinement.

## Required Protocol

1. Do not produce a final proposal until every supplied issue has been resolved and added to the
   issue-to-design traceability table.
2. Preserve labels in implementation recommendations. Put any content concerns only in the
   agent's non-binding **Out-of-scope content observations** section.
3. Keep all work visual-only. Exclude functional, backend, API, domain, Vite or React,
   architecture, component-boundary, and interaction changes.
4. Identify every completed proposal by version or artifact and explicitly request user approval of
   that identified proposal before accepting a separately requested implementation task.