<!-- markdownlint-disable-file -->
<!-- markdown-table-prettify-ignore-start -->
# Discovery - Issue Planning Log

* **Repository**: dkirby-ms/zzyix
* **Milestone**: none proposed
* **Previous Phase**: Just Started
* **Current Phase**: Phase-3 Complete
* **Autonomy**: Partial; user requested draft list before creating issues

## Status

12/12 candidate issue entries were created as GitHub issues #156 through #167 and attached directly under parent issue #155.

**Summary**: Converted the Alexander mosaic patch implementation plan into twelve actionable issues under #155. The source provenance issue records that the ancient artwork is public domain while requiring provenance for the specific source photo or scan.

## Discovered Artifacts and Related Files

* AT001 .copilot-tracking/plans/2026-08-06/alexander-mosaic-patch-plan.instructions.md - Complete - Processing
* AT002 .copilot-tracking/details/2026-08-06/alexander-mosaic-patch-details.md - Complete - Processing

## Discovered GitHub Issues

* GH-156 through GH-167 - Complete - Related - Created and attached under #155 after duplicate searches returned no matches for Alexander mosaic, mosaic import, or mosaic fidelity.

## Issue Progress

### **IS001** - feature - Complete

* IS001 - Issue Section: parent tracker for end-to-end Alexander mosaic patch recreation
* Working Search Keywords: "Alexander mosaic" OR "mosaic import", "deterministic generator", "quilt_place_tile"
* Related GitHub Issues - Similarity: Distinct; duplicate search returned no matching issue
* Suggested Action: Created as #156

### **IS002** - maintenance - Complete

* IS002 - Issue Section: licensed source pack
* Working Search Keywords: "source pack", "license manifest", "Alexander mosaic"
* Related GitHub Issues - Similarity: Not searched
* Suggested Action: Created as #157

### **IS003** - feature - Complete

* IS003 - Issue Section: patch manifest and tile contract validation
* Working Search Keywords: "patch manifest", "tile contract", "mosaicImport"
* Related GitHub Issues - Similarity: Not searched
* Suggested Action: Created as #158

### **IS004** - feature - Complete

* IS004 - Issue Section: deterministic preprocessing pipeline
* Working Search Keywords: "CIELAB", "CLAHE", "saliency mask", "preprocess"
* Related GitHub Issues - Similarity: Not searched
* Suggested Action: Created as #159

### **IS005** - feature - Complete

* IS005 - Issue Section: fixed-grid tessera generator
* Working Search Keywords: "tessera", "fixed grid", "saliency refinements", "tile placement"
* Related GitHub Issues - Similarity: Not searched
* Suggested Action: Created as #160

### **IS006** - feature - Complete

* IS006 - Issue Section: fidelity scoring report
* Working Search Keywords: "fidelity", "MS-SSIM", "EdgeF1", "SilhouetteIoU"
* Related GitHub Issues - Similarity: Not searched
* Suggested Action: Created as #161

### **IS007** - feature - Complete

* IS007 - Issue Section: client import parser and preflight validation
* Working Search Keywords: "mosaicImport", "preflight validation", "tile contract"
* Related GitHub Issues - Similarity: Not searched
* Suggested Action: Created as #162

### **IS008** - feature - Complete

* IS008 - Issue Section: revision-safe client import queue
* Working Search Keywords: "quilt_place_tile", "expectedPatchRevisions", "bounded import", "stale revision"
* Related GitHub Issues - Similarity: Not searched
* Suggested Action: Created as #163

### **IS009** - maintenance - Complete

* IS009 - Issue Section: server persistence and replay verification
* Working Search Keywords: "persistQuiltTilePlacement", "patch operation", "snapshot replay", "mosaic import"
* Related GitHub Issues - Similarity: Not searched
* Suggested Action: Created as #164

### **IS010** - maintenance - Complete

* IS010 - Issue Section: import regression and reconnect tests
* Working Search Keywords: "mosaic import tests", "reconnect convergence", "payload budget", "conflict skipping"
* Related GitHub Issues - Similarity: Not searched
* Suggested Action: Created as #165

### **IS011** - maintenance, documentation - Complete

* IS011 - Issue Section: visual fidelity acceptance harness
* Working Search Keywords: "visual fidelity", "acceptance thresholds", "human QA", "Alexander patch"
* Related GitHub Issues - Similarity: Not searched
* Suggested Action: Created as #166

### **IS012** - maintenance - Complete

* IS012 - Issue Section: final validation and release handoff
* Working Search Keywords: "final validation", "mosaic import", "Playwright", "score thresholds"
* Related GitHub Issues - Similarity: Not searched
* Suggested Action: Created as #167

## Doc Analysis - issue-analysis.md

### .copilot-tracking/plans/2026-08-06/alexander-mosaic-patch-plan.instructions.md

* IS001-IS012 - Issue Sections: Converted implementation phases 1 through 6 into a parent issue and child issues aligned to plan checkpoints.

### .copilot-tracking/details/2026-08-06/alexander-mosaic-patch-details.md

* IS002-IS012 - Issue Sections: Used detailed step success criteria to draft acceptance criteria and dependency relationships.

## Execution Results

* Parent: #155
* Created issues: #156, #157, #158, #159, #160, #161, #162, #163, #164, #165, #166, #167
* Labels were mapped to the repository's existing taxonomy, including `type:feature`, `type:task`, `area:frontend`, `area:realtime`, `area:backend`, `area:data`, `area:qa`, and `documentation`.
* No milestone was assigned.
* GitHub hierarchy verification confirmed all 12 issues appear as sub-issues of #155.

<!-- markdown-table-prettify-ignore-end -->
