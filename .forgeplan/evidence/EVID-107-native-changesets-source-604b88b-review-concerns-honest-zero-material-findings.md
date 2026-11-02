---
depth: standard
id: EVID-107
kind: evidence
last_modified_at: 2026-11-02T16:09:31.783758+00:00
last_modified_by: omp-coding-agent/1.0.0
links:
- target: PRD-073
  relation: informs
- target: RFC-029
  relation: informs
status: active
title: 'Native Changesets source 604b88b review: CONCERNS (honest zero material findings)'
---

---
assigned_number: 107
created: 2026-11-02
predicted_number: 107
slug: evid-native-changesets-source-604b88b-review-concerns-honest-zero-material
updated: 2026-11-02
---

## Structured Fields

verdict: weakens
congruence_level: 3
evidence_type: code_review

## Verdict

CONCERNS

No material source defect survived the pre-report gate. This is an honest zero-findings review, not PASS: the assignment expressly forbids test/lint/build reruns, and the native3 Release/Publish workflows have not been independently exercised live by this reviewer. The structured `weakens` verdict preserves that incomplete verification signal rather than manufacturing positive activation evidence.

## Scope

- Parents: PRD-073 and RFC-029.
- Reviewer: `claude-code/unknown/code-reviewer-task-NativeReleaseReview`; actual harness version was not supplied, so `unknown` is an attribution limitation, not an asserted version.
- Workspace: `/tmp/shared-changesets-20261102` (canonical filesystem root `/private/tmp/shared-changesets-20261102`).
- Branch: `fix/changesets-approved-publication-plan` (dispatch context).
- Frozen range: `262fc20a5d328ff937a47d011954a7a62ca6c40d..604b88b870e32da949d41d80370106d6faee4707`.
- Reviewed all 12 changed files and their complete delta: 834 additions and 571 deletions, including dependency lockfile changes. Read complete changed executable helper/test/workflow files and the relevant complete documentation sections; the lockfile review is of its delta, not every unchanged dependency.
- Files: `.changeset/README.md`, `.changeset/native-peer-contract-majors.md`, `.github/scripts/release-plan.cjs`, `.github/scripts/release-plan.test.mjs`, `.github/workflows/ci.yml`, `.github/workflows/publish.yml`, `.github/workflows/release.yml`, `AGENTS.md` (changed release rules only), `CONTRIBUTING.md`, `README.md`, `package.json`, `pnpm-lock.yaml`.
- Supporting context: full PRD-073/RFC-029 bodies, unchanged `.github/scripts/release-preflight.cjs`, `.changeset/config.json`, existing storage-core major changeset, three relevant peer-package manifests, installed CLI3 publish/pack/plan implementation, and upstream action2.1.2 manifests/source.
- The initial working-tree comparison against the frozen source listed only PRD-073/RFC-029 projections as different; none of the 12 source files differed. Those artifact edits belong to the main session, not this reviewer.
- Parent claim was refused because NativeReleaseTest already held RFC-029. That claim was not overridden or released; this reviewer claimed only its own EVID-107 before filling it.

## Tools run

| Tool / inspection | Exit | Notes |
|---|---|---|
| Frozen git-object / clean-shell diff probes | 0 | Actual base and head resolved; nonempty source delta; literal proof below. |
| Frozen git-object token assertion | 0 | All six expected native3/action2 tokens found independently. |
| `functions.grep` / `read` / `find` / `glob` | n/a | Static source, test, dependency and documentation inspection; no project code executed. |
| Upstream versioned action manifests and source | n/a | Direct primary-source reads; inputs/outputs/default token/tag behavior cross-checked. |
| `gh run view 41477545977` | 0 | Existing source CI directly observed completed/success for604b88b; no rerun. |
| Existing native tarball member inspection | n/a | Read-only archive listing, package manifest and generated changelog; no repack/build/publish. |
| Vitest / actionlint / TypeScript / build / lint / formatters | n/a | Deliberately not run or rerun, per assignment. No fresh pass claim. |
| Hindsight recall and `mm-gate-failures` | unavailable | Both refused before bank access: `/version could not be read`; fpl-hsmem3.7.0 requires API >=0.10.2 and <0.11.0. No recalled fact was used. |
| Code-review-graph | unavailable | Not present in mounted tool inventory; used scoped source tools instead. |
| Publication, registry query, push | n/a | None performed; publication was not authorized. |

Parent-reported actionlint, 28 native helper cases, native versioning of nine targets and five-package build remain reports, not checks rerun by this reviewer. Separately, the completed source CI result was read directly as recorded below. This evidence must not be quoted as this reviewer executing tests.

## Existing source CI observed independently

After the main agent supplied the run identifier, this reviewer ran the read-only command:

```sh
gh run view 41477545977 --repo gertsai/shared --json status,conclusion,headSha,event,jobs,url
```

Exit `0`. Direct returned fields: `status=completed`, `conclusion=success`, `event=pull_request`, `headSha=604b88b870e32da949d41d80370106d6faee4707`, URL https://github.com/gertsai/shared/actions/runs/41477545977 . All six returned jobs have `conclusion=success`: ESLint; Changesets status; Build / Test / Typecheck; Are The Types Wrong; Publint; Dependency Cruiser (m9s-example). The Changesets status job includes successful `Test publication approval boundaries`; its release-PR/dispatch-only steps were skipped as expected on this ordinary PR. The build/test/typecheck job reports successful build, test and typecheck steps.

This is direct observation of an existing GitHub result at the frozen source, not a rerun or a claim of personally executing its checks. It is a pull-request CI run, not the main-push CI that publication preflight will require at the eventual merged/versioned main SHA. It does not exercise the native3 Release/Publish dispatch or query a package registry. CONCERNS remains the required honest-zero verdict despite the green source CI.

## Ground-truth verification

- Base..head source: prompt short base `262fc20`, resolved independently to full base SHA above; prompt full head SHA matched checked-out HEAD.
- Diff state: **DELTA=PRESENT**.
- Expected delta tokens derive from RFC-029's native saved-plan cutover: separate version/publish action2.1.2, CLI3.0.3 pin, approval digest, `pack --from-publish-plan`, `publish --from-pack-dir`.
- Verdict floor: source-delta precondition satisfied; not an empty-diff/vacuous-green result. This does not override the honest-zero CONCERNS policy or authorize publication.

Exact first clean-shell probe:

```sh
bash --noprofile --norc -c 'set +u
R=/tmp/shared-changesets-20261102
git -C "$R" rev-parse --show-toplevel
git -C "$R" rev-parse 262fc20 604b88b870e32da949d41d80370106d6faee4707 HEAD
git -C "$R" diff --stat 262fc20..604b88b870e32da949d41d80370106d6faee4707
git -C "$R" diff --cached --stat
if git -C "$R" diff --quiet 262fc20..604b88b870e32da949d41d80370106d6faee4707 && git -C "$R" diff --cached --quiet; then
  echo DELTA=EMPTY
else
  echo DELTA=PRESENT
fi
git -C "$R" diff --name-status 262fc20..604b88b870e32da949d41d80370106d6faee4707
git -C "$R" diff --name-only 604b88b870e32da949d41d80370106d6faee4707
'
```

Literal stdout:

```text
/private/tmp/shared-changesets-20261102
262fc20a5d328ff937a47d011954a7a62ca6c40d
604b88b870e32da949d41d80370106d6faee4707
604b88b870e32da949d41d80370106d6faee4707
 .changeset/README.md                      |  24 +-
 .changeset/native-peer-contract-majors.md |   6 +
 .github/scripts/release-plan.cjs          | 119 ++++
 .github/scripts/release-plan.test.mjs     | 186 +++++++
 .github/workflows/ci.yml                  |   3 +
 .github/workflows/publish.yml             | 123 ++++-
 .github/workflows/release.yml             |  29 +-
 AGENTS.md                                 |   2 +-
 CONTRIBUTING.md                           |  33 +-
 README.md                                 |   6 +-
 package.json                              |   4 +-
 pnpm-lock.yaml                            | 870 ++++++++++++------------------
 12 files changed, 834 insertions(+), 571 deletions(-)
DELTA=PRESENT
M	.changeset/README.md
A	.changeset/native-peer-contract-majors.md
A	.github/scripts/release-plan.cjs
A	.github/scripts/release-plan.test.mjs
M	.github/workflows/ci.yml
M	.github/workflows/publish.yml
M	.github/workflows/release.yml
M	AGENTS.md
M	CONTRIBUTING.md
M	README.md
M	package.json
M	pnpm-lock.yaml
.forgeplan/prds/PRD-073-safe-changesets-versioning-and-explicit-github-packages-publication.md
.forgeplan/rfcs/RFC-029-separate-changesets-version-pr-automation-from-verified-manual-publication.md
```

Probe exit: `0`; stderr: empty. The per-file frozen workflow/helper/tests, documentation and full lockfile diff were also read through `git diff 262fc20..604b88b870e32da949d41d80370106d6faee4707 -- <named paths>` in the same clean-shell mode, each exit `0`.

Exact frozen-object token probe and assertion (inspection only, not a test of the implementation):

```python
token_script = """set +u
git -C /tmp/shared-changesets-20261102 show 604b88b870e32da949d41d80370106d6faee4707:.github/workflows/release.yml
git -C /tmp/shared-changesets-20261102 show 604b88b870e32da949d41d80370106d6faee4707:.github/workflows/publish.yml
git -C /tmp/shared-changesets-20261102 show 604b88b870e32da949d41d80370106d6faee4707:package.json
"""
token_source = subprocess.run(['bash', '--noprofile', '--norc', '-c', token_script], text=True, capture_output=True)
tokens = ['changesets/action/version@v2.1.2', 'changesets/action/publish@v2.1.2', 'changeset pack --from-publish-plan', 'changeset publish --from-pack-dir', 'expected_plan_sha256', '"@changesets/cli": "3.0.3"']
token_proof = '\n'.join(('FOUND ' if token in token_source.stdout else 'ABSENT ') + token for token in tokens)
print('Frozen git-object token assertion:')
print(token_proof)
print('exit=', token_source.returncode)
```

Literal stdout:

```text
Frozen git-object token assertion:
FOUND changesets/action/version@v2.1.2
FOUND changesets/action/publish@v2.1.2
FOUND changeset pack --from-publish-plan
FOUND changeset publish --from-pack-dir
FOUND expected_plan_sha256
FOUND "@changesets/cli": "3.0.3"
exit= 0
```

A separate specialized `functions.grep` probe used pattern `changesets/action/(version|publish)@v2\.1\.2|publish-plan|from-publish-plan|from-pack-dir|expected_plan_sha256|3\.0\.3` on the two workflow paths and root package manifest; it found the same tokens, including release.yml:54, publish.yml:18,69,179,203,205 and package.json:37. The frozen-object assertion above avoids relying only on mutable working-tree bytes.

## Findings

No material findings survived the ADR-013 pre-report gate; category counts are zero.

I checked the new release-only action and its actual v2 input/output names, the read-only preview and write-capable publish permission split, every approval comparison through native packing and saved-pack publication, archive identity/registry validation, and the explicit peer-contract major note. The observed source and versioned upstream interfaces agree on those paths; the digest covers the complete normalized package/version/access/tag/registry intent, and saved-pack publication does not rediscover additional workspace candidates. I did not turn deliberate boundaries (intent rather than byte-level attestation, trusted main code rather than a sandbox, or unavailable live CI/registry evidence) into speculative source defects or manufacture a finding to produce PASS.

## Review hypotheses and evidence

### H1 — Native3/action2 separation still prevents publishing on ordinary pushes

- release.yml:19-22 grants contents/PR/actions write but no packages write; :37-59 checks local status and runs only `changesets/action/version@v2.1.2` with `script`, `commit-message` and `pr-title`.
- release.yml:60-95 consumes the documented `pr-number` output, validates PR repository/base/head branch, and dispatches ci.yml on `changeset-release/main`.
- publish.yml:3-21 has only manual dispatch, defaults to PREVIEW, and requires PUBLISH plus a nonempty preview before the publishing job (:87-106).
- The pinned upstream version action manifest confirms `pr-number` and the default GitHub-provided token; the publish manifest confirms `script`, `create-github-releases`, `push-git-tags` and the same default token. Its implementation uses the GitHub API for tag pushes, so `persist-credentials: false` in the publishing checkout is compatible.
- Result: supported by direct source/interface inspection, not by an actual new GitHub workflow run.

### H2 — Approval binds native packing/publication to the complete intended set

- publish.yml:34-36 has read-only preview permissions; :54-79 verifies exact dispatched/current main before generating and describing a real native plan. Registry read authentication is supplied to the native CLI; no custom registry HTTP client was added.
- The write-capable job rejects a missing/mismatched 64-hex digest before checkout (:96-106), repeats comparison after build/checks (:158-173), and passes that native plan to `pack --from-publish-plan` (:175-179).
- release-plan.cjs:35-104 rejects unsupported schema, malformed enumeration, private/unknown/duplicate/mismatched-version entries and non-GitHub public manifests; it sorts and hashes every normalized release intent. Adding or removing a candidate, or changing version/access/tag, changes the digest. Reordering dependency chunks does not change intent.
- release-plan.cjs:80-96 also checks pack-directory containment and reads real tarball package.json name/version/private/registry before the final digest/preflight check (publish.yml:186-200). The final action invokes only `publish --from-pack-dir` (:202-209).
- Installed CLI3 source confirms `pack.mjs:38,80-91` reads the supplied plan and preserves it with tarball metadata; `publish.mjs:50,70,90-115,150-156` consumes the saved plan and tarball paths rather than generating a new publication inventory in artifact mode.
- The unchanged preflight (:106-129) still checks PUBLISH, full expected/dispatched/current main SHA, empty fresh Changesets status, GitHub registry policy and latest successful main push CI immediately before publication. Both release workflows share non-cancelling serialization.
- Existing tests were read, not run. They cover added/removed set members, version/access/tag drift, malformed approval, invalid/private/duplicate entries, non-GitHub manifests, schema mismatch, real archive identity changes, pack escape/missing archive, invalid SHA/ref and advanced main.
- Result: source supports the approved-intent boundary. Registry availability, per-package Actions access and irreversible publication were not tested here. The digest intentionally is not a byte-level content attestation or sandbox against trusted-main code; RFC-029 explicitly defines that limit.

### H3 — The CLI3 cutover preserves the intended peer-contract major releases and operator documentation

- package.json:13-16,37 pins pnpm10.29.2 and CLI3.0.3 and raises supported root Node to `^22.13.0 || ^24.0.0 || >=26.0.0`; the lockfile resolves CLI3 and its new dependency graph, including the >=22.13 graph sequencer. Experimental native plan schema is thus produced/consumed by the same pinned CLI.
- `.changeset/native-peer-contract-majors.md:2-6` explicitly makes query-dsl/entity-queries major and explains why storage-core2.x cannot satisfy the new3.x peer contract. The existing storage-core major note and workspace peer manifests corroborate the propagation rationale.
- `.changeset/config.json:11-14` keeps private version/tag handling disabled; independent versions remain configured with empty fixed/linked groups.
- README.md:96-114, CONTRIBUTING.md:30-64 and `.changeset/README.md:21-46` consistently describe GitHub Packages, exact-main PREVIEW, every-candidate owner approval, digest-bound saved packs, the ambiguity of registry404, and fresh approval after partial publication. No npmjs migration or new long-lived credential is promised.
- Independently read the existing real archive `/tmp/changesets-v3-native-pack-20261102/packages/gertsai-entity-queries-1.0.0.tgz`. Its members include LICENSE, CHANGELOG.md, README.md and dist/index.js, index.cjs, index.d.ts, index.d.cts; its manifest is entity-queries1.0.0, registry `https://npm.pkg.github.com`, peers query-dsl/storage-core `^3.0.0`. Its generated1.0.0 changelog includes the new604b88b major explanation.
- Also read `/tmp/changesets-native-pack-proof-20261102.json` and `/tmp/changesets-v3-post-version-status-20261102.json`; the latter literally contains empty changesets/releases. The proof identifies a synthetic single-package plan, `registryQueried: false` and `published: false`. Archive membership/manifest inspection is not execution of the JavaScript/declarations and does not establish real registry discovery.
- Result: documented semver intent matches inspected source and the already-created native archive; nine-target versioning/five-package build are parent-reported, not independently rerun.

## Positive observations

- The write-capable job checks the approved digest before checkout, then rechecks normalized intent after its verification steps and against actual packed identities; this closes the earlier unqualified-publish set-expansion problem (`publish.yml:96-106,158-205`).
- Action2 input/output migration is grounded in the pinned subaction manifests, including `pr-number` and token defaults, rather than assuming v1 compatibility (`release.yml:54-64`, `publish.yml:203-207`).
- The major changeset gives consumers the peer-migration reason, and the release guide explicitly warns that preview candidates can exceed version-PR targets and that404 is not proof of an empty registry (`native-peer-contract-majors.md:6`, `.changeset/README.md:32-46`).

## Test coverage delta

- Before/after line or branch percentages: unknown; no coverage measurement was performed.
- Added source: 28 parameter-expanded helper cases in `.github/scripts/release-plan.test.mjs`; CI explicitly includes `.github/scripts` at ci.yml:39-40. This is an inventory from reading the tests, not a fresh test result.
- Additional observed artifact evidence: real compiled1.0.0 archive identity, peer ranges, changelog and output members; zero pending status in the supplied post-version status file.
- Unverified here: actual native3 GitHub version-action execution/PR CI dispatch, real read-only registry plan, repository access to each candidate, and publication/tag/GitHub-release writes. No unobserved branch is labelled passing.

## Limitations and next steps

- No source edits, tests, lint, build, formatters, registry query, push or publication occurred in this review. Only this new canonical EVID was authored via Forgeplan MCP with an explicit workspace.
- No source-level blocking finding was identified. CONCERNS is nevertheless mandatory for honest zero under the reviewer policy; do not relabel this record PASS or use it as fresh test execution.
- EVID-103's historical guardian blocker is not automatically closed by this review: if an independent PASS is still an absolute guardian prerequisite, the orchestrator must obtain an explicitly accepted gate resolution rather than fabricate one. The three source-review hypotheses here are not permission to mutate historical evidence.
- Main/orchestrator should combine this record with the independent native-source tester evidence, retain the observed successful source CI and check any later changed commit before merge, then observe version-PR regeneration and a real read-only PREVIEW at the resulting exact current main. Owner approval for every listed package/version/digest remains a separate prerequisite before any PUBLISH.
- EVID-101/102/104/105 cover historical CLI2 source; they were not changed or treated as blanket approval of604b88b. This EVID is new, source-specific and independently attributed. Parent lifecycle/activation remains the guardian/orchestrator's decision.

## References

- Parents: PRD-073, RFC-029; new-source tester record identified by the main agent: EVID-106 (not rewritten by this reviewer); historical gate: EVID-103; historical zero-findings review: EVID-105 (unchanged).
- Source: `262fc20a5d328ff937a47d011954a7a62ca6c40d..604b88b870e32da949d41d80370106d6faee4707`.
- https://github.com/changesets/action/blob/v2.1.2/version/action.yml
- https://github.com/changesets/action/blob/v2.1.2/publish/action.yml
- https://github.com/changesets/action/blob/v2.1.2/src/publish/index.ts
- https://github.com/changesets/action/blob/v2.1.2/src/run.ts
- https://changesets.dev/guide/cli#publish-plan




