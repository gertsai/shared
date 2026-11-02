'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');

const REGISTRY = 'https://npm.pkg.github.com';
const SHA_PATTERN = /^[0-9a-f]{40}$/i;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/i;

async function verifyCandidate({ github, context, expectedSha }) {
  if (typeof expectedSha !== 'string' || !SHA_PATTERN.test(expectedSha)) {
    throw new Error('Preview requires a full 40-character expected_sha.');
  }
  if (context.ref !== 'refs/heads/main' || context.sha.toLowerCase() !== expectedSha.toLowerCase()) {
    throw new Error('Preview must use the exact dispatched main commit.');
  }
  const { data: main } = await github.rest.repos.getBranch({ ...context.repo, branch: 'main' });
  if (main?.commit?.sha?.toLowerCase() !== expectedSha.toLowerCase()) {
    throw new Error('main advanced after the requested preview SHA.');
  }
}

function requireApprovedPlan(expected, actual) {
  if (
    typeof expected !== 'string' || !DIGEST_PATTERN.test(expected) ||
    typeof actual !== 'string' || !DIGEST_PATTERN.test(actual) ||
    expected.toLowerCase() !== actual.toLowerCase()
  ) {
    throw new Error('Approved publication plan is missing or changed; review PREVIEW and approve its exact plan SHA-256.');
  }
}

async function describePlan({ core, planPath, candidateSha, workspacePackages, summary = true, packed = false }) {
  const document = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  if (document?.version !== 1 || !Array.isArray(document.plan)) {
    throw new Error('Unsupported native Changesets publication plan.');
  }
  const packages = workspacePackages === undefined
    ? JSON.parse(execFileSync('pnpm', ['--recursive', 'list', '--depth=-1', '--json'], { encoding: 'utf8' }))
    : workspacePackages;
  if (!Array.isArray(packages) || packages.length === 0) {
    throw new Error('Workspace package enumeration is malformed or empty.');
  }
  const manifests = new Map();
  for (const entry of packages) {
    if (entry === null || typeof entry.path !== 'string' || entry.path.length === 0) {
      throw new Error('Workspace package path is malformed.');
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(entry.path, 'package.json'), 'utf8'));
    if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
      throw new Error(`Malformed workspace manifest: ${entry.path}`);
    }
    if (manifest.private === true) continue;
    if (
      typeof manifest.name !== 'string' || !/^@gertsai\/[a-z0-9][a-z0-9._-]*$/.test(manifest.name) ||
      typeof manifest.version !== 'string' || manifest.version.length === 0 ||
      manifest.publishConfig?.registry !== REGISTRY || manifests.has(manifest.name)
    ) {
      throw new Error(`Invalid public workspace release manifest: ${entry.path}`);
    }
    manifests.set(manifest.name, manifest);
  }
  if (manifests.size === 0) throw new Error('No public release packages were found.');

  const releases = [];
  const names = new Set();
  for (const chunk of document.plan) {
    if (!Array.isArray(chunk)) throw new Error('Malformed native release-plan chunk.');
    for (const release of chunk) {
      const manifest = manifests.get(release?.name);
      if (
        release?.kind !== 'publish' || !manifest || release.version !== manifest.version ||
        (release.access !== 'public' && release.access !== 'restricted') ||
        typeof release.tag !== 'string' || release.tag.length === 0 || names.has(release.name)
      ) {
        throw new Error('Native plan contains an invalid, duplicate or private release.');
      }
      if (packed) {
        if (typeof release.tarball?.path !== 'string' || release.tarball.path.length === 0) {
          throw new Error('Packed release is missing its tarball.');
        }
        const directory = path.dirname(path.resolve(planPath));
        const archivePath = path.resolve(directory, release.tarball.path);
        const relative = path.relative(directory, archivePath);
        if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
          throw new Error('Packed release tarball escapes the approved pack directory.');
        }
        const archive = JSON.parse(execFileSync('tar', ['-xOf', archivePath, 'package/package.json'], { encoding: 'utf8' }));
        if (
          archive.name !== release.name || archive.version !== release.version ||
          archive.private === true || archive.publishConfig?.registry !== REGISTRY
        ) {
          throw new Error('Packed tarball identity or registry differs from the approved release.');
        }
      }
      names.add(release.name);
      releases.push({ kind: 'publish', name: release.name, version: release.version, access: release.access, tag: release.tag, registry: REGISTRY });
    }
  }
  releases.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
  const sha256 = createHash('sha256').update(JSON.stringify(releases)).digest('hex');
  core.setOutput('plan_sha256', sha256);
  core.setOutput('plan_json', JSON.stringify(releases));
  core.setOutput('has_releases', releases.length > 0);
  core.info(`Candidate ${candidateSha}; native publication candidates: ${releases.length}; plan_sha256=${sha256}`);
  if (summary) {
    await core.summary
      .addHeading('Read-only native Changesets publication plan')
      .addRaw(`Commit: ${candidateSha}\n\nRegistry: ${REGISTRY}\n\nPlan SHA-256: ${sha256}\n\n`)
      .addTable([[{ data: 'Package', header: true }, { data: 'Version', header: true }, { data: 'Access', header: true }, { data: 'Dist-tag', header: true }], ...releases.map((release) => [release.name, release.version, release.access, release.tag])])
      .addRaw('\nApprove every listed package/version and this digest before PUBLISH. Registry 404 responses can mean a new or inaccessible package; this is the CLI-reported potential set, not proof of access to every package. Preview never publishes.\n')
      .write();
  }
  return { sha256, releases };
}

module.exports = { verifyCandidate, requireApprovedPlan, describePlan };
