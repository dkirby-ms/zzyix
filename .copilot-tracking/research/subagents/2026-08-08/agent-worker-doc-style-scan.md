---
title: Agent Worker Documentation Style Scan
description: Research findings for divergences from HVE writing and Markdown instructions in scoped agent-worker documentation
ms.date: 2026-08-08
ms.topic: reference
---

## Research topics

* Scan scoped agent-worker documentation for divergences from writing-style.instructions.md.
* Scan scoped agent-worker documentation for divergences from markdown.instructions.md.
* Report file path, line number when applicable, issue type, current content, and suggested fix for each issue.

## Scope

In-scope files:

* apps/agent-worker/README.md
* docs/fantome-agent-entra-setup.md
* docs/fantome-resident-agent-architecture.md
* docs/decisions/2026-08-07-resident-agent-architecture.md

Excluded files:

* .github/**
* .copilot-tracking/**, except this research document required by the subagent protocol
* generated reports, coverage, test-results, playwright-report

## Governing conventions checked

* Markdown files must include YAML frontmatter at the beginning.
* When frontmatter includes a title, content starts with H2 or below and does not include an H1.
* Plain ASCII punctuation is preferred unless content requires otherwise.
* Bolded-prefix list items are disallowed.
* Fragment bullets should not end with periods; complete sentence bullets should end with periods.
* Fenced code blocks must specify a language.
* Headings, lists, tables, and code blocks need surrounding blank lines.
* Markdown link syntax and table pipe styles should be valid and consistent.

## Findings

### 1. Missing YAML frontmatter

Severity: error

File: apps/agent-worker/README.md

Line: 1

Issue type: Markdown frontmatter requirement

Current content:

```markdown
# Agent Worker MVP
```

Suggested fix:

Add YAML frontmatter as the first content in the file. If the frontmatter includes `title: Agent Worker MVP`, start the body at H2 or remove the duplicate H1.

```yaml
---
title: Agent Worker MVP
description: Read-only Fantome resident-agent worker prototype
ms.date: 2026-08-08
ms.topic: overview
---
```

### 2. Table columns are not vertically aligned

Severity: warning

File: docs/fantome-agent-entra-setup.md

Lines: 52-62

Issue type: Markdown table formatting

Current content:

```markdown
| Value | Example | Source |
|-------|---------|--------|
| Tenant ID | `<tenant-id>` | Entra tenant that issues worker tokens |
```

Suggested fix:

Pad table cells so the pipe characters align vertically across all rows.

### 3. Ordered-list continuation indentation is inconsistent

Severity: warning

File: docs/fantome-agent-entra-setup.md

Lines: 89-96

Issue type: Markdown list indentation

Current content:

```markdown
1. Confirm the API application ID URI matches `AUTH_AGENT_API_AUDIENCE`, for
  example `api://zzyix-agent-reader`.
```

Suggested fix:

Indent wrapped ordered-list content to align with the text after the marker.

```markdown
1. Confirm the API application ID URI matches `AUTH_AGENT_API_AUDIENCE`, for
   example `api://zzyix-agent-reader`.
```

Apply the same adjustment to the wrapped lines for item 4.

### 4. Self-referential document wording

Severity: suggestion

File: docs/fantome-resident-agent-architecture.md

Lines: 18-26

Issue type: Writing style, self-referential phrasing

Current content:

```markdown
This document consolidates
...
The runtime decision in this document supersedes
...
unless this document narrows them further.
```

Suggested fix:

State the content directly without referring to the document. For example, use `Accepted for the Mosaic Agents MVP architecture track. The closed decisions under the Fantome agent epic ... define the final v1 architecture for implementation planning.`

### 5. Table columns are not vertically aligned

Severity: warning

File: docs/fantome-resident-agent-architecture.md

Lines: 33-40

Issue type: Markdown table formatting

Current content:

```markdown
| Issue | Decision captured |
|-------|-------------------|
| [#173](https://github.com/dkirby-ms/zzyix/issues/173) | Agents are first-class principals that use the same server authority, ownership, validation, revision, collision, idempotency, and replica contracts as humans. |
```

Suggested fix:

Pad cells so all table pipes align vertically. If the table becomes too wide, consider converting it to a list of issue links with short summaries.

### 6. Fragment bullets end with periods

Severity: warning

File: docs/fantome-resident-agent-architecture.md

Lines: 115-124

Issue type: Bullet punctuation consistency

Current content:

```markdown
* Agent identity and quilt assignment.
* Agent lifecycle status.
* Active lease owner and expiry.
```

Suggested fix:

Remove periods from fragment bullets in this list.

### 7. Command-style bullets end with periods

Severity: warning

File: docs/fantome-resident-agent-architecture.md

Lines: 167-173

Issue type: Bullet punctuation consistency

Current content:

```markdown
* Read agent status.
* Read assigned patch metadata.
* Produce a structured agent response.
```

Suggested fix:

Remove periods from short command-style bullets, or rewrite each item as a complete sentence if periods are desired.

### 8. Fragment bullets end with periods

Severity: warning

File: docs/fantome-resident-agent-architecture.md

Lines: 194-201

Issue type: Bullet punctuation consistency

Current content:

```markdown
* Configurable Foundry endpoint and deployment alias.
* Low-cost and low-latency default model routing.
* Explicit escalation policy for stronger models.
```

Suggested fix:

Remove periods from fragment bullets in this list.

### 9. Fragment bullets end with periods

Severity: warning

File: docs/fantome-resident-agent-architecture.md

Lines: 237-245

Issue type: Bullet punctuation consistency

Current content:

```markdown
* Policy-controlled system and developer instructions.
* Agent persona and configuration required for the approved interaction.
* Public quilt metadata and the agent's own runtime status.
```

Suggested fix:

Remove periods from fragment bullets in this list, including wrapped bullets whose period appears on the continuation line.

### 10. Fragment bullets end with periods

Severity: warning

File: docs/fantome-resident-agent-architecture.md

Lines: 281-287

Issue type: Bullet punctuation consistency

Current content:

```markdown
* Agent ID, quilt ID, run ID, checkpoint ID, tool-call ID, and model-call ID.
* Prompt template version and model deployment alias.
* Retrieved source IDs and response safety classification.
```

Suggested fix:

Remove periods from fragment bullets in this list.

### 11. Fragment bullets end with periods

Severity: warning

File: docs/fantome-resident-agent-architecture.md

Lines: 297-301

Issue type: Bullet punctuation consistency

Current content:

```markdown
* Python runtime version.
* Microsoft Agent Framework package versions.
* Checkpoint schema version.
```

Suggested fix:

Remove periods from fragment bullets in this list.

### 12. Fragment bullets end with periods

Severity: warning

File: docs/fantome-resident-agent-architecture.md

Lines: 321-332

Issue type: Bullet punctuation consistency

Current content:

```markdown
* Lease-loss and crash-recovery behavior.
* Recovery from the previous checkpoint schema.
* Unsupported citation behavior and cross-user private-data exclusion.
```

Suggested fix:

Remove periods from fragment bullets in this list.

### 13. Prose line exceeds the approximate 500-character limit

Severity: suggestion

File: docs/decisions/2026-08-07-resident-agent-architecture.md

Line: 165

Issue type: Markdown line length/readability

Current content:

```markdown
The conversational Foundry integration is approved by this ADR. A new ADR is required before expanding model authority or changing the hosting boundary. Approval must include a measured comparison against the deterministic baseline for artistic value, latency, cost, reproducibility, explainability, privacy, provider failure, abuse resistance, and rollback. The model must remain outside the authority boundary, and model-generated proposals must never mutate the canvas without passing the same server contracts as every other client.
```

Suggested fix:

Wrap the paragraph across multiple source lines without changing the rendered text.

## Summary

Total issues found: 13

Issues by severity:

* Error: 1
* Warning: 10
* Suggestion: 2

Additional passes needed: no for discovery. Run markdownlint or the repository frontmatter validator after fixes are applied.

Confidence level in completeness: medium. The scan covered the requested files and checked the governing rules directly, but no automated markdownlint command was run during this read-only discovery pass.

Clarifying questions: none.
