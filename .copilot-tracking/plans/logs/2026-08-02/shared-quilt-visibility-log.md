<!-- markdownlint-disable-file -->

# Shared Quilt Visibility Planning Log

## Selected path

Assigned-patch entry remains necessary because placement requires ownership of every touched patch. Chunk occupancy fixes cross-user discovery without weakening mutation authorization: it covers the whole quilt while respecting aggregate authorization and bounded payloads.

## Discrepancies

The initial shared-entry approach was reverted after review found that non-owners could not place in the shared initial patch.

The placement follow-up corrected incremental cache updates that cleared settled chunk memberships. Viewport movement had hidden the defect by loading a fresh authoritative snapshot.

## Follow-on work

Consider replacing polling with a quilt-level summary invalidation event if occupancy request volume becomes material.