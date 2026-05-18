---
depth: standard
id: PRD-040
kind: prd
last_modified_at: 2026-05-18T21:06:49.663395+00:00
last_modified_by: claude-code/2.1.142
status: active
title: Wave 12.G — 38-package aggregate risk matrix synthesis
---

## Problem Statement

5 Wave-12 audits (EVID-043/044/048/051/053) produced ~150 findings across 38 packages. No single document gives an "at-a-glance" risk matrix per package showing severity distribution + closure status + remaining hot spots.

## Goals

1. Per-package risk row: severity distribution (CRIT/HIGH/MED/LOW) raw vs after-closure, primary categories of remaining issues, R_eff per audit.
2. Cross-cutting pattern callouts (e.g. external-type-leak Wave 13 recurrence pattern across m9s-cache/fetch/queue/rest-rm/api-rlr).
3. Recommended next wave: most-impactful 1-3 actions per package or workspace.

## Functional Requirements

**FR-001** — Per-package row covers all 38 `@gertsai/*` packages + 3 example apps. Status: closed / open count per severity.
**FR-002** — Cross-cutting pattern section enumerates Wave-13-style recurrences observed across multiple packages.
**FR-003** — Recommended next-wave action list, prioritised by (severity_max × consumer_count).

## Non-Functional Requirements

Read-only research — no code changes. Produces EVID-057.

## Out of Scope

Actual fixes (separate PRD per remaining finding).

Refs: EVID-043, EVID-044, EVID-048, EVID-051, EVID-053, EVID-054, EVID-055, EVID-056.



