---
depth: standard
id: PRD-041
kind: prd
last_modified_at: 2026-05-18T21:06:57.115377+00:00
last_modified_by: claude-code/2.1.142
status: active
title: Wave 12.D2 — deep-audit @gertsai/core un-sampled 84% (agent + query + session + llm/providers)
---

## Problem Statement

Wave 12.D audit (EVID-051) sampled ~16% of `@gertsai/core` (~1k of ~7k LOC). 84% remains un-audited — primarily `agent.ts`, `query/`, `session/`, `llm/providers/`. These are foundational platform contracts; un-audited surface is a known risk per EVID-051 §coverage notes.

## Goals

1. 4 parallel domain reviewers cover the un-sampled 84% with same depth as Wave 12.D.
2. Severity-graded findings (CRIT/HIGH/MED/LOW) with file:line citations.
3. Per-domain summary: agent runtime + query DSL + session lifecycle + LLM provider abstraction.

## Functional Requirements

**FR-001** — 4 reviewers (`code-analyzer` for logic/architecture, `typescript-type-auditor` for type system, `security-expert` for security/threat model, `performance-engineer` for runtime perf) — each gets a domain × all 4 modules.
**FR-002** — Cross-validation by orchestrator: same-file-line collapse, severity max-merge.
**FR-003** — EVID-058 documents aggregated findings with `## Structured Fields`.

## Non-Functional Requirements

Read-only audit. No code changes in this PRD. Fixes → separate follow-up.

Refs: EVID-051 (Wave 12.D precedent), `packages/core/src/{agent,query,session,llm}/`.



