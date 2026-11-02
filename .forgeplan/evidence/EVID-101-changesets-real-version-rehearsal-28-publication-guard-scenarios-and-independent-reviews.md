---
depth: standard
id: EVID-101
kind: evidence
last_modified_at: 2026-11-02T13:33:48.103576+00:00
last_modified_by: omp-coding-agent/1.0.0
links:
- target: PRD-073
  relation: informs
- target: RFC-029
  relation: informs
status: active
title: 'Changesets: real version rehearsal, 28 publication guard scenarios and independent reviews'
---

---
assigned_number: 101
created: 2026-11-02
predicted_number: 101
slug: evid-changesets-real-version-rehearsal-28-publication-guard-scenarios-and
updated: 2026-11-02
---

# Changesets implementation verification

## Structured Fields
evidence_type: measurement
verdict: supports
congruence_level: 3
base_sha: 4bf577bfcd8891f7f5d2fa948b855f660761e390
result_sha: 4d713da41c9333f5915e24fe6100809a6544c323
changed_paths: .changeset/config.json, .changeset/README.md, .github/workflows/ci.yml, .github/workflows/release.yml, .github/workflows/publish.yml, .github/workflows/storybook.yml, .github/scripts/release-preflight.cjs, README.md, CONTRIBUTING.md, package.json, AGENTS.md

## Measurement
Recorder: main orchestrator. Target: PRD-073 / RFC-029. Date: 2026-11-02. Isolated task worktrees; installed Changesets 2.31.0 and pnpm 10.29.2. No registry publication or publish workflow dispatch occurred in these local checks.

- actionlint 1.7.12, shellcheck disabled, validated ci.yml/release.yml/publish.yml/storybook.yml; exit 0.
- node --check .github/scripts/release-preflight.cjs; exit 0.
- pnpm run lint; exit 0, ESLint max-warnings 0.
- pnpm run changeset:status --since=origin/main; exit 0 for setup-only changes.
- pnpm release --help; exit 0, displays gh workflow run usage without dispatch.
- Real Changesets status/version in disposable clone, then a committed version candidate/local main baseline and unfiltered status. Compare public plan to baseline, check generated manifest and changelog versions, private example unchanged.
- Invoke the real publication preflight helper against 28 deterministic API/status/package fixtures. Final fixture uses actual versioned candidate manifests and actual CLI status JSON; GitHub API remains a fixture, not a claim of live CI.
- pnpm pack of versioned entity-queries validates archive metadata, LICENSE/changelog inclusion and workspace dependency range conversion. This scratch archive has no compiled dist and is not publication-ready; it tests metadata only.

## Result
28 guard scenarios passed, 0 failed. Refused missing/wrong confirmation; short/nonhex/wrong expected SHA; non-main ref; advanced main; malformed branch/status/CI payload; pending changesets or release entries; missing/wrong registry; no public packages; invalid manifest; missing, failed, running, wrong-event or wrong-SHA CI; newer failed CI over older success. Valid fixture and private-package exclusion behaved as specified.

Real version generation produced nine unchanged public target versions: entity-react 3.0.1, storage-core 3.0.0, entity-storage 7.0.0, entity-queries 1.0.0, rpc-proxy-builder 8.1.0, entity 1.2.1, fetch 0.4.2, pg-client 4.0.0, query-dsl 3.0.0. Each generated changelog matches its manifest. Private m9s-example remains 0.0.31. Post-version status: changesets=[], releases=[].

Actual entity-queries 1.0.0 archive manifest targets https://npm.pkg.github.com and converts query-dsl/storage-core peer dependencies to ^3.0.0. Archive includes LICENSE and CHANGELOG.md.

Independent static reviews: ReleaseSecurity (security-reviewer) PASS, no remaining findings; ReleaseSemverReview (reviewer) PASS, no remaining findings. Earlier missing detached-checkout local main baseline and inaccurate registry/visibility docs were fixed before PASS. Reviewers ran no commands and did not authorize publication.

## Interpretation
Supports the version-only automation/manual-publication design and local refusal behavior. AGENTS.md contains the user's requested short authoring, versioning and publication rules, linking to .changeset/README.md. The code uses repository job credentials for trusted main code; restricting NODE_AUTH_TOKEN environment scope is not hostile-build isolation.

Not yet observed: setup PR/main CI and live bot release-PR workflow dispatch. PRD-073 remains draft until these checks are observed. No publication authorization is inferred from these checks.

## Limitations
The first scratch build lacked per-package dependency links. An isolated offline install and a subsequent linked scratch rebuild hit host ENOSPC (disk 100% full). Removed only task-created scratch dependency copies, leaving the original developer working tree and caches unchanged. The full candidate rebuild did not pass locally; real PR/release CI must provide compiled package/build/type/test evidence. The archive metadata check is not proof of a compiled distributable.

## Provenance
- Guard SHA-256: 58cc93b9a809609340688facb826281eeeb774c90cf6ae4ceed69c2ba15a271b.
- /tmp/changesets-preflight-proof-20261102.log SHA-256: 818b7c8af94358a4d38e8d2a52bd3fd269a44c7d66e2276fe77402c7f90b5f06.
- /tmp/changesets-version-proof-20261102.json SHA-256: 02ce560caedf87a01a13baa704ec89d07f0b2d7b690888320094524494563a50.
- Metadata-only gertsai-entity-queries-1.0.0.tgz SHA-256: 77dc6b332ceef3e294a92f732a9324f98bb399866a9886ca3507f8447dca2fc2.

## Congruence Level Justification
CL3: actual target repository code and installed tools, with deterministic external API fixtures explicitly bounded. Live GitHub execution and actual publication are separate evidence.

## Related Artifacts
Informs PRD-073 and RFC-029.



