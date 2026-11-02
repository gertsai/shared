---
depth: standard
id: RFC-029
kind: rfc
last_modified_at: 2026-11-02T17:37:06.672274+00:00
last_modified_by: omp-coding-agent/1.0.0
links:
- target: PRD-073
  relation: based_on
status: active
title: Separate Changesets version PR automation from verified manual publication
---

---
assigned_number: 29
created: 2026-11-02
prd: null
predicted_number: 29
slug: rfc-separate-changesets-version-pr-automation-from-verified-manual-publication
updated: 2026-11-02
---

# Changesets release pipeline

## Summary
Use Changesets CLI 3.0.3 and Changesets Action 2.1.2 with pnpm 10.29.2 and supported Node 22.13+, 24 or 26+. Version preparation never publishes. GitHub Packages is the existing publication destination. No PAT or registry migration.

## Motivation
PR136 separated version preparation from publishing. Subsequent inspection found that unqualified changeset publish discovers every public workspace version missing from the registry, not only version-PR targets. Bind publication to an explicitly approved native publication plan.

## Options Considered
1. Chosen: native publish-plan, pack --from-publish-plan, and publish --from-pack-dir. Validate scope and archive identity independently; use version/publish subactions, never the combined automatic action.
2. Rejected: unqualified publish following approval of only nine version bumps; registry discovery may include additional packages.
3. Rejected: custom registry inventory client; native CLI3 handles registry semantics without a parallel implementation.
4. Rejected: auto publication or new PAT solely for version-PR CI. Existing GITHUB_TOKEN dispatch suffices.

## Proposed Direction
release.yml computes local Changesets status and invokes changesets/action/version@v2.1.2 only when notes exist. It dispatches ci.yml against the actual changeset-release/main head using pr-number. Version preparation has no packages-write permission.

publish.yml defaults to PREVIEW on exact current main. Its read-only job generates a native publication plan and uploads the candidate artifact. PUBLISH additionally requires the exact SHA and SHA256 digest of the owner-approved package/version/access/tag/registry intent. Write-capable job rejects a missing or mismatched digest before checkout. Existing preflight requires latest successful main push CI and no pending changesets/releases. After build/test/type/lint/package gates, regenerate registry plan, compare approval digest, pack only that plan, verify real tarball package identities and registry, refresh status/main/CI checks, and publish only saved pack contents with changesets/action/publish@v2.1.2. Both tag and GitHub release creation are explicit. No positive publication without owner approval per listed package.

Native schema1 is version-pinned and unsupported schema fails closed. Approval describes intent, not a sandbox or byte-level artifact attestation. Registry access failures do not establish an empty registry. Scoped GitHub registry is provided consistently by setup-node. Explicit major notes preserve query-dsl3.0.0 and entity-queries1.0.0 peer-contract targets under CLI3. Private examples remain unversioned/untagged.

## Invariants
Normal pushes never publish. No package outside approved intent is added during publication. Every public archive targets GitHub Packages. A changed main SHA or fresh plan revokes prior approval. Partial publication requires a fresh remaining-set preview and approval.

## Implementation Phases
- [x] Implement initial separation and observe PR136/main/version-PR CI (EVID101/102 historical).
- [x] Implement native3 approved-plan cutover and concise AGENTS.md/docs.
- [x] Run 28 helper tests, actionlint, real native versioning, five-package build, real compiled archive packing and empty post-version status.
- [x] Independent native-source review/test evidence EVID107/108.
- [x] Final guardian gate: EVID112 PASS7/7, no unresolved blockers.
- [x] Merge native PR137 after green CI; EVID109 records actual native version-PR regeneration,6/6 release-head CI, read-only preview and malformed-approval refusal.

## Verification
Source604b88b870e32da949d41d80370106d6faee4707. Versioned fixture3c9cdaead95a0a50de02e93d83e93f160d92d726 preserved nine reviewed versions. Native pack exercised actual entity-queries1.0.0 with LICENSE, CHANGELOG, ESM/CJS/declarations; synthetic plan, no registry availability claim. Unfiltered post-version status has zero changesets/releases. Earlier pre-version0.1 pack lacked CHANGELOG, correctly corrected by testing actual versioned candidate rather than weakening the archive assertion.

## ADI Reasoning
### Hypothesis 1
Unqualified publish after approving version bumps can publish extra missing workspace versions. Vendor CLI docs/source support this; native saved-pack publication removes rediscovery at publish time.
### Hypothesis 2
Native read-only plan plus canonical intent digest can detect added/removed packages and changed version/access/tag/registry. Independent behavioral tests cover these transitions, and actual packed1.0 archive preserves the approved identity digest. No claim that a synthetic plan proves registry availability.
### Hypothesis 3
Pinning CLI3/action2 and using their separate version/publish APIs avoids automatic publication while retaining native version PRs. Local real version/pack/status operations pass; actual new GitHub dispatch and preview remain required live evidence.

## Rollback Plan
Revert configuration through a reviewed PR before publication. Never overwrite published versions or reset public tags. Published corrections require separately approved new versions or deprecation.

## Sources
https://changesets.dev/guide/cli
https://github.com/changesets/action/releases/tag/v2.1.2
https://github.com/changesets/changesets/tree/%40changesets/cli%403.0.3/packages/cli/src/commands

## Related Artifacts
PRD-073 parent. EVID101/102/104/105 and BLOCKER103 describe historical CLI2 setup, not blanket approval of this extension.

## Final configuration gate
EVID112 records independent PASS7/7 after scoped native coverage EVID111 and genuine tester findings. EVID103 and110 are preserved as superseded historical gates. Reported scorer0.3 is retained without inflation; the actual review permits activation without force. Owner explicitly approved all nine listed versions at main ecea518ae3fe8ad3fbfbd36406f1cfd63cd7a3c2 with intent digest581105805248fe0519104a0012bb201dbb0b62f297e4b2c58a87622743ca24bf, taglatest/accesspublic, GitHub Packages. Actual publication is now verified separately by EVID113.

## Publication outcome
After explicit owner Y, workflow41490931083 published the exact approved native pack at commit ecea518ae3fe8ad3fbfbd36406f1cfd63cd7a3c2. EVID113 verifies nine published GitHub Releases, nine tags resolving to that commit and a fresh authenticated read-only native plan with no remaining unpublished versions (run41492361164). No retries, new credentials, forced tags or public npm migration.

