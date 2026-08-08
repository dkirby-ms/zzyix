<!-- markdownlint-disable-file -->
<!-- markdown-table-prettify-ignore-start -->
# Discovery - Issue Planning Log

* **Repository**: `dkirby-ms/zzyix`
* **Previous Phase**: N/A
* **Current Phase**: Phase-3 review handoff

## Status

18 candidates planned; 17 new GitHub issues created under #172; 1 existing issue left unchanged; 1 accidental duplicate (#174) closed; 1 similar historical-mosaic issue remains a follow-up.

**Summary**: Parsed the Atelier Fantome resident-agent design into a staged, gate-aware backlog draft. The draft prioritizes low-fidelity validation, autonomy and privacy controls, architecture decisions, operational controls, and end-to-end evidence before rare behavior or production rollout.

## Discovered Artifacts and Related Files

* AT001 `.copilot-tracking/dt/atelier-fantome/agent-design.md` - Complete - Processing

## Discovered GitHub Issues

* GH-130 - Complete - Processing - Match for IS001; existing Atelier Phantom epic.
* GH-155 - Complete - Related - Similar to IS010; autonomous famous-mosaic recreation epic.

## Issue Progress

* IS001 through IS012 - Complete - Drafted in `issue-analysis.md` and `issues-plan.md`
* IS001 - Complete - Update existing #130 rather than create duplicate parent
* IS010 - In-Progress - Resolve relationship and cross-milestone scope with #155
* IS013 through IS018 - Complete - Added LLM, framework, tool-boundary, model gateway, evaluation, and production governance candidates
* Execution - Complete - Created #173 and #175 through #190 under #172 with `Mosaic Agents MVP`; closed #174 as duplicate of #175

## Search Record

* Planned keyword groups: `"resident agent" OR "canvas resident"`, `"quiet witness" OR glyphs OR motifs`, `"disengagement" OR "respectful distance"`, `"creative memory" OR "sensitive memory"`, `"historical echoes" OR "mythic"`, `"multi-replica" OR "server authoritative"`, `"resident marks" OR "social interpretation"`
* Search status: Complete with read-only `gh issue list` and `gh issue view` commands. No mutation tools were called.
* Duplicate review status: #130 is a Match; #155 is Similar; all other focused searches returned no matches.
* Queries: `"resident agent"`; `canvas agent OR mosaic agent OR autonomous agent`; `disengagement OR "respectful distance" OR attention`; `creative memory OR sensitive memory OR privacy memory`; `historical mosaic OR historical echo OR mythic OR resident marks`; `Atelier Phantom OR Atelier Fantome OR phantom resident OR phantom canvas`.

## Phase Summary

* Phase 1: Complete. Extracted requirements, behavior tiers, risks, prototype priorities, and success signals.
* Phase 2: Complete. Grouped requirements into one parent capability and eleven staged child candidates with relationships and decision gates.
* Duplicate assessment: Complete. Reclassified IS001 as Update #130 and flagged IS010 for review against #155.
* Architecture assessment: Complete. Repository package manifests contain no LLM or agent-framework dependency; deterministic-first architecture is recommended pending IS013.
* Execution result: Complete. GitHub issue types were unavailable, so valid repository labels were used without issue-type assignment. All 17 new issues received milestone #6 and were linked to #172.
* Phase 3: Complete. Review handoff prepared. User approval is required before execution planning or issue creation.

## Open Review Questions

* Is one parent issue with eleven children the preferred granularity?
* Should #130 absorb the detailed delivery contract, or should it link to a separate planning issue?
* Should IS010 be a child of #130, coordinated with #155, or deferred until the replicas milestone is complete?
* Should IS013 through IS018 be retained as separate issues, or combined into an architecture decision and one implementation slice?
* Follow-up: Resolve the relationship between #182 and #155 during implementation planning.
* Should architecture and privacy decisions be separate issues or one discovery gate?
* Should Method 6 prototypes remain backlog issues, or be tracked as DT artifacts only?
* Which milestone, if any, should contain the first prototype slice?
* What evidence threshold should authorize production behavior?
<!-- markdown-table-prettify-ignore-end -->
