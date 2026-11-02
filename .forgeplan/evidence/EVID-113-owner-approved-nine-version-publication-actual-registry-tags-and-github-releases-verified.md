---
depth: standard
id: EVID-113
kind: evidence
last_modified_at: 2026-11-02T17:36:08.253397+00:00
last_modified_by: omp-coding-agent/1.0.0
links:
- target: RFC-029
  relation: informs
- target: PRD-073
  relation: informs
status: active
title: 'Owner-approved nine-version publication: actual registry, tags and GitHub Releases verified'
---

---
assigned_number: 113
created: 2026-11-02
predicted_number: 113
slug: evid-owner-approved-nine-version-publication-actual-registry-tags-and-github
updated: 2026-11-02
---

# Actual approved publication receipt

## Structured Fields
verdict: supports
congruence_level: 3
evidence_type: integration_test

## Verdict
PASS for actual publication and bounded post-publication verification. Recorder omp-coding-agent. This is a receipt of observed irreversible writes, not a dry-run or a substitute for owner approval.

## Ground-truth verification
Owner explicitly replied `да/ да Y` to the exact nine-version table, GitHub Packages registry, latest tag/public access, main ecea518ae3fe8ad3fbfbd36406f1cfd63cd7a3c2 and intent digest581105805248fe0519104a0012bb201dbb0b62f297e4b2c58a87622743ca24bf. Main SHA and successful push CI41481803555 were checked immediately before dispatch. Guardian EVID112 PASS7/7 preceded PRD073 then RFC029 activation without force. Main remained unchanged throughout publication.

Actual workflow41490931083, eventworkflow_dispatch, attempt1, approvedSHA: success. Both preview and publish jobs succeeded. All build/test/typecheck/lint/publint/ATTW/Dependency Cruiser, fresh native plan approval, actual pack identity and final current-main/CI/status preflights succeeded. Final Publish packages and create GitHub releases step completed successfully2026-11-02T17:33:32Z. No publication rerun, overwrite, forced tag or extra credential was used.

## Findings
### F1 — Actual registry state changed exactly as intended
Before publication, actual native PREVIEW41481831977 returned exactly the approved nine names/versions in dependency batches4/3/2. After successful publication, a NEW read-only native PREVIEW41492361164 on the same approvedSHA succeeded; downloaded schema1 artifact is exactly {version:1,plan:[]}. Its publishing job was skipped. Thus no current public workspace version, including any of the nine approved targets, remained unpublished according to the real registry query. No fabricated registry inventory or local credential access claim.

### F2 — All nine tags resolve to approved source
Read actual GitHub refs; dereference annotated tag objects; assert every expected tag resolves to exact commit ecea518ae3fe8ad3fbfbd36406f1cfd63cd7a3c2. Nine of nine verified. Before publishing none of these target tags existed.

### F3 — All nine GitHub Releases are actually published
GET each exact version tag release; assert matching tag_name, draftfalse, prereleasefalse and nonempty published_at. Nine of nine verified, not inferred from workflow status.

### F4 — Approval and configuration boundaries held
Publication used only the owner-approved saved native pack. The automatic version-only main workflow had no publishing step; all source/version merges had already completed through PRs. Private examples were not included in the nine-entry native plan. Historical failures and CONCERNS remain preserved in EVID103/110 as superseded by the final gate, not rewritten into passes.

## Published versions and actual releases
| Package | Version | Published release |
|---|---|---|
| `@gertsai/entity` | 1.2.1 | [431763814](https://github.com/gertsai/shared/releases/tag/%40gertsai/entity%401.2.1) |
| `@gertsai/entity-queries` | 1.0.0 | [431764181](https://github.com/gertsai/shared/releases/tag/%40gertsai/entity-queries%401.0.0) |
| `@gertsai/entity-react` | 3.0.1 | [431764021](https://github.com/gertsai/shared/releases/tag/%40gertsai/entity-react%403.0.1) |
| `@gertsai/entity-storage` | 7.0.0 | [431764077](https://github.com/gertsai/shared/releases/tag/%40gertsai/entity-storage%407.0.0) |
| `@gertsai/fetch` | 0.4.2 | [431763868](https://github.com/gertsai/shared/releases/tag/%40gertsai/fetch%400.4.2) |
| `@gertsai/pg-client` | 4.0.0 | [431764240](https://github.com/gertsai/shared/releases/tag/%40gertsai/pg-client%404.0.0) |
| `@gertsai/query-dsl` | 3.0.0 | [431764129](https://github.com/gertsai/shared/releases/tag/%40gertsai/query-dsl%403.0.0) |
| `@gertsai/rpc-proxy-builder` | 8.1.0 | [431763927](https://github.com/gertsai/shared/releases/tag/%40gertsai/rpc-proxy-builder%408.1.0) |
| `@gertsai/storage-core` | 3.0.0 | [431763972](https://github.com/gertsai/shared/releases/tag/%40gertsai/storage-core%403.0.0) |

## Provenance
https://github.com/gertsai/shared/actions/runs/41490931083
https://github.com/gertsai/shared/actions/runs/41492361164

```json
[
  {
    "path": "/tmp/changesets-versioned-live-preview-20261102/publish-plan.json",
    "bytes": 1545,
    "sha256": "2a933d796c97987ff2dc2f0d174b79377cbad162a7f3220da259c90a55fa7df8"
  },
  {
    "path": "/tmp/changesets-post-publication-preview-20261102/publish-plan.json",
    "bytes": 32,
    "sha256": "674f582a4d53bbe2cc84a344f8f93cdddf663de630017ebf85df047b7189fe70"
  },
  {
    "path": "/tmp/changesets-actual-publication-run-20261102.json",
    "bytes": 25714,
    "sha256": "4879d468339707bdcf73526d84bf3be0405b213fff41b6ff503dac7b40746416"
  },
  {
    "path": "/tmp/changesets-actual-publication-proof-20261102.json",
    "bytes": 3329,
    "sha256": "2f18272d69b441acb0d7400fee760ffec66521808b221a16f5e66ca1fea54e5d"
  }
]
```

## Limits
GitHub Packages is not public npm. No package visibility migration or byte-level registry tarball comparison is claimed. Presence is verified by before/after authenticated native registry plans; tag source and published-release states were separately read via actual GitHub API. The known tooling score-advisory inconsistency and degraded agent-memory lookup did not produce invented facts or forced activation; final configured gate passed.



