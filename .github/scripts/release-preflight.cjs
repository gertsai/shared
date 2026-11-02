'use strict';

const fs = require('node:fs');
const path = require('node:path');

const GITHUB_PACKAGES_REGISTRY = 'https://npm.pkg.github.com';
const SHA_PATTERN = /^[0-9a-f]{40}$/i;

function requireFullSha(value, label) {
  if (typeof value !== 'string' || !SHA_PATTERN.test(value)) {
    throw new Error(`${label} must be a full 40-character commit SHA.`);
  }
  return value.toLowerCase();
}

function readChangesetsStatus(statusPath) {
  if (typeof statusPath !== 'string' || statusPath.length === 0) {
    throw new Error('Changesets status file path is missing.');
  }

  const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
  if (
    status === null ||
    typeof status !== 'object' ||
    !Array.isArray(status.changesets) ||
    !Array.isArray(status.releases)
  ) {
    throw new Error('Changesets status file has an invalid shape.');
  }
  if (status.changesets.length !== 0 || status.releases.length !== 0) {
    throw new Error('Publication is blocked while Changesets reports pending changesets or releases.');
  }
}

function validatePublicPackageRegistries() {
  const packagesDirectory = path.join(process.cwd(), 'packages');
  const packageDirectories = fs.readdirSync(packagesDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  if (packageDirectories.length === 0) {
    throw new Error('No packages were found under packages/.');
  }

  let publicPackageCount = 0;
  for (const directory of packageDirectories) {
    const manifestPath = path.join(packagesDirectory, directory, 'package.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
      throw new Error(`Package manifest is malformed: ${manifestPath}`);
    }
    if (manifest.private === true) continue;

    publicPackageCount += 1;
    if (manifest.publishConfig?.registry !== GITHUB_PACKAGES_REGISTRY) {
      throw new Error(`Public package ${directory} is not configured for GitHub Packages.`);
    }
  }
  if (publicPackageCount === 0) {
    throw new Error('No public packages were found under packages/.');
  }
  return publicPackageCount;
}

async function validateLatestCiRun(github, owner, repo, sha) {
  const { data } = await github.rest.actions.listWorkflowRuns({
    owner,
    repo,
    workflow_id: 'ci.yml',
    branch: 'main',
    event: 'push',
    head_sha: sha,
    per_page: 100,
  });
  if (data === null || typeof data !== 'object' || !Array.isArray(data.workflow_runs)) {
    throw new Error('GitHub returned malformed CI workflow-run data.');
  }

  const matchingRuns = data.workflow_runs.filter((run) => {
    if (
      run === null ||
      typeof run !== 'object' ||
      typeof run.head_sha !== 'string' ||
      !SHA_PATTERN.test(run.head_sha) ||
      typeof run.event !== 'string' ||
      typeof run.head_branch !== 'string' ||
      typeof run.status !== 'string' ||
      (run.conclusion !== null && typeof run.conclusion !== 'string') ||
      typeof run.created_at !== 'string' ||
      Number.isNaN(Date.parse(run.created_at))
    ) {
      throw new Error('GitHub returned a malformed CI workflow run.');
    }
    return run.head_sha.toLowerCase() === sha && run.event === 'push' && run.head_branch === 'main';
  });
  if (matchingRuns.length === 0) {
    throw new Error(`No CI workflow push run was found for main SHA ${sha}.`);
  }

  matchingRuns.sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at));
  const latest = matchingRuns[0];
  if (latest.status !== 'completed' || latest.conclusion !== 'success') {
    throw new Error(`Latest CI run for main SHA ${sha} is not completed successfully.`);
  }
}

module.exports = async function validateReleasePreflight({ github, context, core, statusPath }) {
  if (process.env.RELEASE_CONFIRMATION !== 'PUBLISH') {
    throw new Error('Confirmation must equal PUBLISH.');
  }

  const expectedSha = requireFullSha(process.env.EXPECTED_SHA, 'expected_sha');
  const dispatchedSha = requireFullSha(context.sha, 'Dispatched workflow SHA');
  if (context.ref !== 'refs/heads/main') {
    throw new Error('Publication workflow must be dispatched from main.');
  }
  if (expectedSha !== dispatchedSha) {
    throw new Error('expected_sha does not match the dispatched workflow commit.');
  }

  const { owner, repo } = context.repo;
  const { data: mainBranch } = await github.rest.repos.getBranch({ owner, repo, branch: 'main' });
  const currentMainSha = requireFullSha(mainBranch?.commit?.sha, 'Current remote main SHA');
  if (currentMainSha !== expectedSha) {
    throw new Error('main advanced after the requested publication SHA.');
  }

  readChangesetsStatus(statusPath);
  const publicPackageCount = validatePublicPackageRegistries();
  await validateLatestCiRun(github, owner, repo, expectedSha);

  core.info(`Preflight passed for main SHA ${expectedSha}; ${publicPackageCount} public packages target GitHub Packages; Changesets reports no pending changesets or releases; latest push CI succeeded.`);
};
