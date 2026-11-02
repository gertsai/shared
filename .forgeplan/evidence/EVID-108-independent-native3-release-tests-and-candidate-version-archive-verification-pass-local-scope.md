---
depth: standard
id: EVID-108
kind: evidence
last_modified_at: 2026-11-02T17:12:46.820054+00:00
last_modified_by: omp-coding-agent/1.0.0
links:
- target: PRD-073
  relation: informs
- target: RFC-029
  relation: informs
status: active
title: 'Independent native3 release tests and candidate version/archive verification: PASS (local scope)'
---

---
assigned_number: 108
created: 2026-11-02
predicted_number: 108
slug: evid-independent-native3-release-tests-and-candidate-version-archive
updated: 2026-11-02
---


# Independent native3 release test evidence

## Verdict

**PASS — bounded local verification, not publication approval.**

The independently executed requested helper suite passed 28/28 tests. All nine expected version targets match the real native-versioned workspace and frozen source versions; all three private examples retain their source versions, including `m9s-example@0.0.31`. The actual compiled `entity-queries@1.0.0` archive passes the production packed-plan identity/digest check. Independent unfiltered Changesets status on the versioned candidate with `main == HEAD` exits 0 with no notes or releases. A separate run in the pre-version-baseline fixture exits 1; that diagnostic and its baseline distinction are retained below.

This PASS covers only the assigned local tests, version comparison, real archive inspection, and candidate-status check. It does not certify every parent AC, live native-source Actions dispatch, registry availability, or publication. No build, linter, formatter, push, publish, registry query, or source/test change was performed by this tester. Existing test execution created only its normal temporary fixtures/cache and the `/tmp` reporter/status outputs recorded here.

## Findings

1. **F1 — Version and private-example observations match the reviewed oracle.** The recorded independent comparison found all **9/9** public package targets equal to the native3 version-plan proof and their source old versions equal to frozen source604b. All three private example versions remained unchanged, including `m9s-example@0.0.31`; all nine expected changelog headings were present. These are positive observed findings, not fabricated defects.
2. **F2 — The real compiled archive preserves the bounded approved identity.** The recorded inspection and production helper execution verified the actual `@gertsai/entity-queries@1.0.0` tarball, GitHub Packages registry, canonical intent digest, and matching stored tarball integrity. LICENSE, CHANGELOG, ESM/CJS implementations and both declaration entry points were present. This used the explicitly synthetic single-package native-format plan, not a registry-derived production inventory or byte-level owner attestation.
3. **F3 — Unfiltered status is baseline-dependent, and both observations remain visible.** The recorded candidate fixture had `main == HEAD == 3c9cdaead95a0a50de02e93d83e93f160d92d726` and produced exit0 with exactly empty changesets/releases arrays. The original versioning fixture kept main at source604b and produced the preserved exit1 diagnostic. The correct-baseline result did not remove or relabel that refusal; no `--since` narrowing was used for the candidate check.
4. **F4 — The historical PASS remains explicitly uninstrumented and local.** This record's 28-case test PASS and version/archive/status observations do not claim a numeric code-coverage percentage, full parent acceptance, actual publication, or registry availability. EVID-111 supplies the separately measured helper coverage. This findings-only metadata addition reruns no tests or checks, changes no recorded measurements, and preserves the original uninstrumented boundary.

## Structured Fields

verdict: supports
congruence_level: 3
evidence_type: test

## Context and provenance

- Parents: PRD-073 and RFC-029, relation `informs`.
- Workspace: `/tmp/shared-changesets-20261102` (physical path `/private/tmp/shared-changesets-20261102`).
- Source branch: `fix/changesets-approved-publication-plan`.
- Frozen source: `604b88b870e32da949d41d80370106d6faee4707`.
- Frozen base: `262fc20a5d328ff937a47d011954a7a62ca6c40d` (PR136/main baseline).
- Real versioned fixture: `/tmp/shared-changesets-v3-smoke-20261102`, HEAD `3c9cdaead95a0a50de02e93d83e93f160d92d726`; parent is source604b. Its local `main` remains at source604b.
- Publication-candidate fixture: `/tmp/shared-changesets-v3-candidate-20261102`, `HEAD == main == 3c9cdaead95a0a50de02e93d83e93f160d92d726`; its committed tree is identical to the versioned fixture, `839cf921d200380107b3dc49b4a2a5e4e55e901c`.
- Test identity: `claude-code/version-not-provided/tester-task-NativeReleaseTest`; the dispatch did not supply a Claude Code version, so none is fabricated. Both parent claims were explicitly released before recording this evidence, as requested by Main.
- EVID-101/102/104/105 are historical CLI2 records and are not used to claim native3 verification. EVID-103 was not altered. This evidence owns only this new canonical EVID.
- Prior-pattern recall and pipeline mental-model requests both failed at the Hindsight compatibility check (`/version could not be read`; no bank request sent). No memory write was attempted; these unavailable lookups do not replace observed test results.

## Ground-truth verification

- Base..head: `262fc20a5d328ff937a47d011954a7a62ca6c40d..604b88b870e32da949d41d80370106d6faee4707` (base resolved from prompt-supplied prior-main commit; head resolved independently and equals the dispatched source).
- All shell probes ran in `bash --noprofile --norc -c` without inherited shell startup files.
- Diff state: **DELTA=PRESENT** — 12 changed files, 834 insertions, 571 deletions; cached diff was empty.
- Expected delta: `requireApprovedPlan`, native `--from-publish-plan` / `--from-pack-dir`, `changesets/action/version@v2.1.2` / `publish@v2.1.2`, and CLI3.0.3. Source: dispatched native3 contract and current RFC-029.
- Token probe: **FOUND** (specialized Grep tool invocation below). The relevant real frozen source diff was also read in full, not inferred from a worker's report.
- Ground-truth gate: **PASS-eligible**, not a vacuous green suite.

### Literal diff probe command and stdout

```bash
set +u
R="/tmp/shared-changesets-20261102"
BASE=$(git -C "$R" rev-parse 262fc20)
HEAD=$(git -C "$R" rev-parse HEAD)
printf 'BASE=%s
HEAD=%s
' "$BASE" "$HEAD"
git -C "$R" diff --no-ext-diff --stat "$BASE".."$HEAD"
git -C "$R" diff --cached --stat
if git -C "$R" diff --quiet "$BASE".."$HEAD" && git -C "$R" diff --cached --quiet; then
  echo "DELTA=EMPTY"
else
  echo "DELTA=PRESENT"
fi
git -C "$R" diff --no-ext-diff --name-only "$BASE".."$HEAD"
```

Working directory: `/tmp/shared-changesets-20261102`. Exit code: `0`. Wall-clock duration: `0.044294` seconds.

```text
BASE=262fc20a5d328ff937a47d011954a7a62ca6c40d
HEAD=604b88b870e32da949d41d80370106d6faee4707
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
.changeset/README.md
.changeset/native-peer-contract-majors.md
.github/scripts/release-plan.cjs
.github/scripts/release-plan.test.mjs
.github/workflows/ci.yml
.github/workflows/publish.yml
.github/workflows/release.yml
AGENTS.md
CONTRIBUTING.md
README.md
package.json
pnpm-lock.yaml
```


### Literal token probe and stdout

```json
{
  "pattern": "requireApprovedPlan|--from-publish-plan|--from-pack-dir|changesets/action/(version|publish)@v2\\.1\\.2|\"@changesets/cli\": \"3\\.0\\.3\"",
  "path": "/tmp/shared-changesets-20261102/.github/scripts/release-plan.cjs;/tmp/shared-changesets-20261102/.github/workflows/publish.yml;/tmp/shared-changesets-20261102/.github/workflows/release.yml;/tmp/shared-changesets-20261102/package.json",
  "case": true,
  "gitignore": true,
  "skip": 0
}
```

Tool: `functions.grep` (`i="Locating required frozen tokens"`), returned:

```text
# /tmp/shared-changesets-20261102/
## package.json#A099
 36:    "@arethetypeswrong/cli": "^0.18.2",
*37:    "@changesets/cli": "3.0.3",
 38:    "@moonrepo/cli": "^1.30.0",
 39:    "@types/node": "^22.10.0",
 40:    "@typescript-eslint/eslint-plugin": "^8.59.2",

## .github/

### scripts/
#### release-plan.cjs#CF0B
 24:
*25:function requireApprovedPlan(expected, actual) {
 26:  if (
 27:    typeof expected !== 'string' || !DIGEST_PATTERN.test(expected) ||
 28:    typeof actual !== 'string' || !DIGEST_PATTERN.test(actual) ||
...
 118:
*119:module.exports = { verifyCandidate, requireApprovedPlan, describePlan };

### workflows/
#### publish.yml#6F88
 170:          script: |
*171:            const { describePlan, requireApprovedPlan } = require('./.github/scripts/release-plan.cjs');
 172:            const plan = await describePlan({ core, planPath: process.env.PUBLISH_PLAN_PATH, candidateSha: context.sha, summary: false });
*173:            requireApprovedPlan(process.env.EXPECTED_PLAN_SHA256, plan.sha256);
 174:
 175:      - name: Pack only the approved native publication plan
 176:        env:
...
 178:          RELEASE_PACK_DIR: ${{ runner.temp }}/release-pack
*179:        run: pnpm changeset pack --from-publish-plan "$PUBLISH_PLAN_PATH" --out-dir "$RELEASE_PACK_DIR"
 180:
 181:      - name: Refresh Changesets status after packing
 182:        env:
...
 195:          script: |
*196:            const { describePlan, requireApprovedPlan } = require('./.github/scripts/release-plan.cjs');
 197:            const plan = await describePlan({ core, planPath: process.env.PACKED_PLAN_PATH, candidateSha: context.sha, summary: false, packed: true });
*198:            requireApprovedPlan(process.env.EXPECTED_PLAN_SHA256, plan.sha256);
 199:            const validate = require('./.github/scripts/release-preflight.cjs');
 200:            await validate({ github, context, core, statusPath: process.env.CHANGESET_STATUS_PATH });
 201:
 202:      - name: Publish packages and create GitHub releases
*203:        uses: changesets/action/publish@v2.1.2
 204:        with:
*205:          script: pnpm changeset publish --from-pack-dir "${{ runner.temp }}/release-pack"
 206:          create-github-releases: true
 207:          push-git-tags: true
 208:        env:
#### release.yml#42F1
 53:        id: changesets
*54:        uses: changesets/action/version@v2.1.2
 55:        with:
 56:          script: pnpm run version:packages
 57:          commit-message: 'chore: release packages'
```

Frozen code diff read command (exit 0):

```bash
git -C /tmp/shared-changesets-20261102 diff --no-ext-diff --unified=2 262fc20a5d328ff937a47d011954a7a62ca6c40d..604b88b870e32da949d41d80370106d6faee4707 -- .github/scripts/release-plan.cjs .github/scripts/release-plan.test.mjs .github/workflows/publish.yml .github/workflows/release.yml .github/workflows/ci.yml package.json .changeset/native-peer-contract-majors.md
```

The frozen diff introduces the approval helper and 28-case test file, CI invocation, native publication plan/pack/saved-pack pipeline, separate version/publish subactions, CLI pin, supported Node engines, and explicit peer-contract major notes. Source observations are not a claim that a hosted Actions run was exercised by this tester.

## Runner detected

- Ecosystem: Node/TypeScript.
- Runtime: Node `v22.18.0`, pnpm `10.29.2`.
- Runner: Vitest `3.2.4`; Changesets CLI `3.0.3`.
- Config source: root `package.json` devDependencies (`vitest: ^3.0.0`, exact `@changesets/cli: 3.0.3`, packageManager `pnpm@10.29.2`) and `.github/workflows/ci.yml:39-40`.
- Existing test file: `.github/scripts/release-plan.test.mjs`; no new tests authored.
- Root `scripts.test` runs package suites; the assigned command intentionally targets the existing release helper suite directly.
- Output formats: primary `text`; supplemental `json` with retry enabled for detailed durations. Counts below describe one 28-case suite, not a misleading aggregate of both runs.

```bash
node --version && pnpm --version && pnpm exec vitest --version && pnpm exec changeset --version && node -e 'const p=require("./package.json"); console.log(JSON.stringify({test:p.scripts.test,cli:p.devDependencies["@changesets/cli"],vitest:p.devDependencies.vitest,packageManager:p.packageManager}))' 
```

Working directory: `/tmp/shared-changesets-20261102`. Exit code: `0`. Wall-clock duration: `0.724948` seconds.

```text
v22.18.0
10.29.2
vitest/3.2.4 darwin-arm64 node-v22.18.0
3.0.3
{"test":"pnpm -r --workspace-concurrency=4 run test","cli":"3.0.3","vitest":"^3.0.0","packageManager":"pnpm@10.29.2"}
```


## Command run

### Exact requested independent run

```bash
pnpm exec vitest run --dir .github/scripts
```

Working directory: `/tmp/shared-changesets-20261102`. Exit code: `0`. Wall-clock duration: `0.744928` seconds.

```text

 RUN  v3.2.4 /private/tmp/shared-changesets-20261102

 ✓ .github/scripts/release-plan.test.mjs (28 tests) 87ms

 Test Files  1 passed (1)
      Tests  28 passed (28)
   Start at  19:02:09
   Duration  277ms (transform 23ms, setup 0ms, collect 20ms, tests 87ms, environment 0ms, prepare 45ms)
```


### Supplemental structured run

```bash
pnpm exec vitest run --dir .github/scripts --reporter=json --outputFile=/tmp/native-release-test-vitest-20261102.json --retry=1
```

Working directory: `/tmp/shared-changesets-20261102`. Exit code: `0`. Wall-clock duration: `0.757175` seconds.

```text
JSON report written to /tmp/native-release-test-vitest-20261102.json
```


Structured report: `/tmp/native-release-test-vitest-20261102.json`. It reports `numTotalTests=28`, `numPassedTests=28`, `numFailedTests=0`, `numPendingTests=0`, `numTodoTests=0`, `success=true`. Individual assertions all have status `passed` and empty failureMessages.

## Summary

| Metric | Value |
|---|---|
| Passed | 28 |
| Failed | 0 |
| Skipped | 0 |
| Pending implementation cases | 0 |
| Flaky (observed passed on retry) | 0 observed |
| Total unique test cases | 28 |
| Test files | 1 passed |
| Primary runner duration | 0.277 seconds |
| Primary test-body duration | 0.087 seconds |
| Primary measured process wall time | 0.744928 seconds |
| Supplemental measured process wall time | 0.757175 seconds |
| Native version targets matched | 9/9 |
| Private example versions unchanged | 3/3 |
| Approved packed archives inspected | 1 |
| Additional/unapproved archive files | 0 (one `.tgz` found in the inspected pack directory) |
| Correct-baseline unfiltered status | exit 0; changesets 0, releases 0 |

## AC coverage delta

Parents: PRD-073 / RFC-029. Neither read parent specifies a numeric statement/branch coverage threshold.

- AC coverage target: n/a — no numeric code-coverage threshold.
- Actual statement/branch percentage: **not instrumented**, not a fabricated percentage.
- Delta: n/a.

| Acceptance area | Observed independent evidence | Scope / limitation |
|---|---|---|
| Exact owner-intent approval | Existing 28-case suite covers reordered chunks, extra public workspaces outside `packages/`, reduced remaining set, changed versions/access/tag, malformed digests | Deterministic local helper tests, not registry/API availability |
| Fail-closed native scope and archive identity | Existing tests cover private/unknown/duplicate/tag-only/mismatched releases, bad registry, unsupported schema, wrong tarball identity, missing/escaping tarballs | Production helper checked the real saved archive below |
| Exact current main candidate | Existing tests cover malformed SHA, wrong dispatch SHA/ref, and main advancing | GitHub API responses are deterministic fixtures; no real main read by this tester |
| FR-004 independent versioning/private exclusions | 9/9 real versioned manifests and changelog headings match; 3 private versions unchanged | Inspected existing native-versioned fixture; did not rerun mutating versioning |
| Native local no-pending-status gate | Unfiltered CLI3 status passes with real versioned candidate main baseline | Original pre-version-baseline fixture correctly refuses; output preserved |
| FR-001 / FR-005 workflow separation | Actual source and frozen diff show version-only action, PREVIEW read permissions, explicit PUBLISH job, GitHub Packages registry, saved-pack publish | Static source observation plus local helper execution; not a hosted workflow execution |
| Current-source live CI / version PR / native registry preview | Not independently exercised here | Main/guardian must use separate current-source live evidence; old CLI2 evidence is not reused |
| Real positive publication | Not executed and not authorized | Outside this PASS; no npmjs or GitHub Packages write attempted |

## Native nine-target version verification

Oracle: `/tmp/changesets-native-v3-version-plan-proof-20261102.json`, `cli=3.0.3`, nine targets. Actual manifests were read from `/tmp/shared-changesets-v3-smoke-20261102/packages/<name>/package.json`; source old versions were independently read with `git -C /tmp/shared-changesets-20261102 show 604b88b870e32da949d41d80370106d6faee4707:packages/<name>/package.json`. In Python Eval, assertions compared each actual name/new version and source old version against the oracle; all passed. Each target is public and retains `publishConfig.registry=https://npm.pkg.github.com`. All nine changelog top headings are present at line 3 with the exact expected target version.

| Package | Frozen source version | Expected native version | Actual fixture version | Result |
|---|---|---|---|---|
| `@gertsai/entity-react` | 3.0.0 | 3.0.1 | 3.0.1 | MATCH |
| `@gertsai/query-dsl` | 2.1.0 | 3.0.0 | 3.0.0 | MATCH |
| `@gertsai/entity-queries` | 0.1.0 | 1.0.0 | 1.0.0 | MATCH |
| `@gertsai/storage-core` | 2.0.0 | 3.0.0 | 3.0.0 | MATCH |
| `@gertsai/entity-storage` | 6.0.0 | 7.0.0 | 7.0.0 | MATCH |
| `@gertsai/rpc-proxy-builder` | 8.0.0 | 8.1.0 | 8.1.0 | MATCH |
| `@gertsai/entity` | 1.2.0 | 1.2.1 | 1.2.1 | MATCH |
| `@gertsai/fetch` | 0.4.1 | 0.4.2 | 0.4.2 | MATCH |
| `@gertsai/pg-client` | 3.0.0 | 4.0.0 | 4.0.0 | MATCH |

| Private example | Frozen source version | Actual fixture version | Result |
|---|---|---|---|
| `@gertsai-examples/m9s-example` | 0.0.31 | 0.0.31 | true / unchanged |
| `@gertsai-examples/m9s-example-web` | 0.0.24 | 0.0.24 | true / unchanged |
| `@gertsai-examples/m9s-example-api-types` | 0.0.24 | 0.0.24 | true / unchanged |

Private identities and source versions were compared using the same frozen `git show` method for `examples/<name>/package.json`. Config explicitly has `privatePackages.version=false`, `privatePackages.tag=false`, empty fixed/linked groups, patch internal dependency updates, and workspace-protocol-only bumping. Archive-resolved peer dependencies for entity-queries are `@gertsai/query-dsl: ^3.0.0` and `@gertsai/storage-core: ^3.0.0` (workspace placeholders do not survive in the real archive).

## Real compiled native-pack proof inspection

Inspected supplied proof `/tmp/changesets-native-pack-proof-20261102.json`, actual native `publish-plan.json`, and actual archive `/tmp/changesets-v3-native-pack-20261102/packages/gertsai-entity-queries-1.0.0.tgz`. The supplied proof describes a real CLI3 pack operation on the built versioned package, but this tester did **not** rerun build/pack. Instead this tester independently invoked the production `describePlan(..., packed:true)` / `requireApprovedPlan` against those real bytes and checked the stored tarball integrity.

```bash
node -e 'const fs = require('"'"'node:fs'"'"');
const assert = require('"'"'node:assert/strict'"'"');
const crypto = require('"'"'node:crypto'"'"');
const {describePlan, requireApprovedPlan} = require('"'"'/tmp/shared-changesets-20261102/.github/scripts/release-plan.cjs'"'"');
(async () => {
  const proof = JSON.parse(fs.readFileSync('"'"'/tmp/changesets-native-pack-proof-20261102.json'"'"','"'"'utf8'"'"'));
  const planPath = '"'"'/tmp/changesets-v3-native-pack-20261102/publish-plan.json'"'"';
  const plan = JSON.parse(fs.readFileSync(planPath,'"'"'utf8'"'"'));
  const intent = await describePlan({core:{setOutput(){}, info:console.log},planPath,candidateSha:'"'"'3c9cdaead95a0a50de02e93d83e93f160d92d726'"'"',summary:false,packed:true});
  requireApprovedPlan(proof.planSha256, intent.sha256);
  assert.deepEqual(intent.releases, proof.expected);
  const archive = fs.readFileSync(proof.archive);
  const integrity = '"'"'sha256-'"'"' + crypto.createHash('"'"'sha256'"'"').update(archive).digest('"'"'base64'"'"');
  assert.equal(integrity, plan.plan[0][0].tarball.integrity);
  assert.equal(proof.registryQueried, false);
  assert.equal(proof.published, false);
  console.log(JSON.stringify({intent: intent.releases, planSha256:intent.sha256, archiveSha256:crypto.createHash('"'"'sha256'"'"').update(archive).digest('"'"'hex'"'"'),tarballIntegrity:integrity,archiveBytes:archive.length,proofIntentMatches:true,realArchiveIdentityValidated:true,syntheticPlan:true,registryQueried:false,published:false},null,2));
})().catch(error => {console.error(error.message);process.exitCode=1;});'
```

Working directory: `/tmp/shared-changesets-v3-candidate-20261102`. Exit code: `0`. Wall-clock duration: `0.215117` seconds.

```text
Candidate 3c9cdaead95a0a50de02e93d83e93f160d92d726; native publication candidates: 1; plan_sha256=4729aaf7ea2921b164bcc44ced307956c28a26cf7412f363b0599fdc52eff0bb
{
  "intent": [
    {
      "kind": "publish",
      "name": "@gertsai/entity-queries",
      "version": "1.0.0",
      "access": "public",
      "tag": "latest",
      "registry": "https://npm.pkg.github.com"
    }
  ],
  "planSha256": "4729aaf7ea2921b164bcc44ced307956c28a26cf7412f363b0599fdc52eff0bb",
  "archiveSha256": "6dfc34123b0cd88d444da56aab2a408cafd2d4c4ee810b2a16d3101c2f689057",
  "tarballIntegrity": "sha256-bfw0EjsM2I1ETaVqqypAjK/S1MTugQsqFtMQHC9okFc=",
  "archiveBytes": 17952,
  "proofIntentMatches": true,
  "realArchiveIdentityValidated": true,
  "syntheticPlan": true,
  "registryQueried": false,
  "published": false
}
```


Actual archive members inspected through the archive reader:

- `package/package.json`: name `@gertsai/entity-queries`, version `1.0.0`, Apache-2.0, public access, `https://npm.pkg.github.com`, import/require/type exports for all four compiled entry points.
- `package/CHANGELOG.md`: starts with `## 1.0.0`, includes the source604b peer-contract major note and query-dsl3/storage-core3 propagated versions.
- `package/LICENSE`: real Apache License 2.0 text.
- `package/dist/index.js` (5.2 KB): real compiled ESM implementation, including live read-path functions.
- `package/dist/index.cjs` (5.6 KB): real CommonJS implementation with `require('@gertsai/query-dsl')`.
- `package/dist/index.d.ts` and `package/dist/index.d.cts` (9.3 KB each): real declarations importing the query-dsl/storage-core contract.
- Source maps are also present; no claim that their presence exercises runtime behavior.

**Boundary:** this is a **synthetic single-package native-format plan**, not a registry-derived inventory. Its approved intent contains only `@gertsai/entity-queries@1.0.0`, `access=public`, `tag=latest`, registry `https://npm.pkg.github.com`. Canonical intent SHA256 is `4729aaf7ea2921b164bcc44ced307956c28a26cf7412f363b0599fdc52eff0bb`. Real tarball SHA256 is `6dfc34123b0cd88d444da56aab2a408cafd2d4c4ee810b2a16d3101c2f689057`; SRI matches the saved native plan. No registry query or publication was executed in this independent run. This does not establish registry availability, an actual nine-package publish plan, permission to publish, or byte-level owner attestation of all release archives. Main publication destination is **GitHub Packages, not npmjs**.

## Unfiltered status and fixture-baseline distinction

The two fixtures have different purposes. The smoke fixture records versioning against source604b; its `main` remains source604b while HEAD is the version commit3c9. The candidate fixture represents a version-PR-merged main checkout: its local main and HEAD are both3c9, and the committed tree is identical. This tester did not reset, force, delete, or move either fixture's branch.

### Preserved initial diagnostic (wrong baseline for a publication candidate)

```bash
pnpm changeset status --output /tmp/native-release-test-post-version-status-20261102.json
```

Working directory: `/tmp/shared-changesets-v3-smoke-20261102`. Exit code: `1`. Wall-clock duration: `0.335416` seconds.

```text

> @gertsai/shared-monorepo@0.0.0 changeset /private/tmp/shared-changesets-v3-smoke-20261102
> changeset status --output /tmp/native-release-test-post-version-status-20261102.json

🦋 changeset v3.0.3

Some packages have been changed but no changesets were found. Run changeset add to resolve this error.
If this change doesn't need a release, run changeset add --empty.
🦋 Exited with code 1

 ELIFECYCLE  Command failed with exit code 1.
```


No output JSON was generated by that exit1 run; the attempted read correctly reported the path missing. This is **not** recorded as a failing Vitest test or hidden by the later result. It shows that unfiltered status refuses source-to-version changes without notes when `main` still names the pre-version source. The corrected candidate check below uses a different existing fixture with the proper main baseline, not a narrowed `--since` filter.

### Frozen candidate provenance and clean tracked state

```bash
git -C /tmp/shared-changesets-v3-candidate-20261102 rev-parse HEAD main && git -C /tmp/shared-changesets-v3-candidate-20261102 rev-parse HEAD^{tree} && git -C /tmp/shared-changesets-v3-smoke-20261102 rev-parse HEAD^{tree} && git -C /tmp/shared-changesets-v3-candidate-20261102 diff --name-only HEAD
```

Working directory: `/tmp/shared-changesets-20261102`. Exit code: `0`. Wall-clock duration: `0.178707` seconds.

```text
3c9cdaead95a0a50de02e93d83e93f160d92d726
3c9cdaead95a0a50de02e93d83e93f160d92d726
839cf921d200380107b3dc49b4a2a5e4e55e901c
839cf921d200380107b3dc49b4a2a5e4e55e901c
```


### Independent candidate status (no `--since` and no ignored/filtered entries)

```bash
pnpm changeset status --output /tmp/native-release-test-candidate-status-20261102.json
```

Working directory: `/tmp/shared-changesets-v3-candidate-20261102`. Exit code: `0`. Wall-clock duration: `0.313222` seconds.

```text

> @gertsai/shared-monorepo@0.0.0 changeset /private/tmp/shared-changesets-v3-candidate-20261102
> changeset status --output /tmp/native-release-test-candidate-status-20261102.json

🦋 changeset v3.0.3
```


Raw independent output `/tmp/native-release-test-candidate-status-20261102.json`:

```json
{
  "changesets": [],
  "releases": []
}
```

It is byte-identical by SHA256 to the supplied unfiltered `/tmp/changesets-v3-post-version-status-20261102.json`. Both contain exactly the two empty arrays; no private-package filtering was used.

## Failing tests

None. Both observed 28-case suite executions exited 0. The separately recorded original-fixture status exit1 is a baseline diagnostic, not a test-suite failure.

## Slow tests (top 5)

From the supplemental structured JSON reporter; durations are per assertion, not process wall time.

| Test | Duration |
|---|---|
| packed archives retain the approved publication identity preserves approval while adding real tarball metadata | 14.069 ms |
| packed archives retain the approved publication identity refuses different tarball identity or registry: {"name":"@gertsai/other"} | 11.553 ms |
| packed archives retain the approved publication identity refuses different tarball identity or registry: {"publishConfig":{"registry":"https://registry.npmjs.org"}} | 11.406 ms |
| packed archives retain the approved publication identity refuses different tarball identity or registry: {"version":"9.0.0"} | 11.170 ms |
| packed archives retain the approved publication identity refuses missing tarballs and paths outside the pack directory | 8.569 ms |

## Flaky candidates

No inconsistent result was observed across the two suite executions. Supplemental invocation used `--retry=1`; the Vitest JSON reporter does not expose a `retryCount` for these assertions, so **0 observed** is not a claim that future runs cannot flake. Primary exact requested run passed all 28 without a retry flag. There were no skipped or pending implementation cases and no skipped suite hidden in the counts.

## Proof checksums

```bash
shasum -a 256 /tmp/changesets-native-v3-version-plan-proof-20261102.json /tmp/changesets-native-pack-proof-20261102.json /tmp/changesets-v3-post-version-status-20261102.json /tmp/native-release-test-candidate-status-20261102.json /tmp/changesets-v3-native-pack-20261102/publish-plan.json /tmp/changesets-v3-native-pack-20261102/packages/gertsai-entity-queries-1.0.0.tgz /tmp/native-release-test-vitest-20261102.json
```

Working directory: `/tmp/shared-changesets-20261102`. Exit code: `0`. Wall-clock duration: `0.037606` seconds.

```text
bcf19bc194340f505e8e532198a0657516e151542df84531d87ece7c93c20e6b  /tmp/changesets-native-v3-version-plan-proof-20261102.json
34edd831c843d87936833946d2ea0891e002bf9e4bb1eeca9a3fe915a4750064  /tmp/changesets-native-pack-proof-20261102.json
4ec7c626b19296521c4582c178975c4327a5ab42a27d2883138e9f3a605c2441  /tmp/changesets-v3-post-version-status-20261102.json
4ec7c626b19296521c4582c178975c4327a5ab42a27d2883138e9f3a605c2441  /tmp/native-release-test-candidate-status-20261102.json
080f56a8075ea1b49ef21c5c308ea5d830ec975cdc058e773b422a91ab8cef1f  /tmp/changesets-v3-native-pack-20261102/publish-plan.json
6dfc34123b0cd88d444da56aab2a408cafd2d4c4ee810b2a16d3101c2f689057  /tmp/changesets-v3-native-pack-20261102/packages/gertsai-entity-queries-1.0.0.tgz
baa6f23d16fa906306ebfefe32acde864ee1531a7e9559943e92ac52bb2a048f  /tmp/native-release-test-vitest-20261102.json
```


## Next steps and limitations

- Hand this **local PASS** to the guardian/main agent for the parent activation gate; this tester does not activate artifacts or authorize any publication.
- Live native-source Actions/version-PR behavior and an authenticated read-only native registry preview require their own current-source evidence. Parent/guardian owns that remaining scope; this record does not silently inherit historical CLI2 green checks.
- Do not treat the synthetic one-package pack as the owner-approved production set. A fresh native preview on the exact eligible main SHA must define that set; any actual publication still requires separate explicit owner approval of its digest/package intent.
- No build/lint/formatter, package-wide test suite, coverage instrumentation, registry discovery, tag creation, GitHub release creation, push, or publication was executed by this tester.

