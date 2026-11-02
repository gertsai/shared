import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import helpers from './release-plan.cjs';

const { describePlan, requireApprovedPlan, verifyCandidate } = helpers;
const roots = [];
const SHA = 'a'.repeat(40);
const REGISTRY = 'https://npm.pkg.github.com';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gertsai-release-plan-'));
  roots.push(root);
  const workspacePackages = [];
  function addPackage(directory, name, version, extra = {}) {
    const location = path.join(root, directory);
    fs.mkdirSync(location, { recursive: true });
    fs.writeFileSync(path.join(location, 'package.json'), JSON.stringify({ name, version, publishConfig: { registry: REGISTRY }, ...extra }));
    workspacePackages.push({ path: location });
  }
  addPackage('packages/alpha', '@gertsai/alpha', '1.0.0');
  addPackage('examples/beta', '@gertsai/beta', '2.0.0');
  addPackage('examples/private', '@gertsai/private', '9.0.0', { private: true });
  return {
    root,
    workspacePackages,
    archive(extra = {}) {
      const staging = path.join(root, 'staging');
      fs.mkdirSync(path.join(staging, 'package'), { recursive: true });
      fs.writeFileSync(path.join(staging, 'package/package.json'), JSON.stringify({ name: '@gertsai/alpha', version: '1.0.0', publishConfig: { registry: REGISTRY }, ...extra }));
      execFileSync('tar', ['-czf', path.join(root, 'alpha.tgz'), '-C', staging, 'package']);
      return { ...alpha(), tarball: { path: 'alpha.tgz' } };
    },
    async plan(chunks, overrides = {}, options = {}) {
      const planPath = options.planPath ?? path.join(root, 'plan.json');
      fs.mkdirSync(path.dirname(planPath), { recursive: true });
      fs.writeFileSync(planPath, JSON.stringify({ version: 1, plan: chunks, ...overrides }));
      return describePlan({ core: { setOutput() {}, info() {} }, planPath, candidateSha: SHA, workspacePackages, summary: false, ...options });
    },
  };
}

function release(name, version, extra = {}) {
  return { kind: 'publish', name, version, access: 'public', tag: 'latest', ...extra };
}
const alpha = () => release('@gertsai/alpha', '1.0.0');
const beta = () => release('@gertsai/beta', '2.0.0');

function candidate(overrides = {}) {
  return {
    expectedSha: SHA,
    context: { ref: 'refs/heads/main', sha: SHA, repo: { owner: 'gertsai', repo: 'shared' } },
    github: { rest: { repos: { async getBranch() { return { data: { commit: { sha: SHA } } }; } } } },
    ...overrides,
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true });
});

describe('owner approval binds the complete publication intent', () => {
  it('accepts the same intent across dependency chunks and presentation order', async () => {
    const f = fixture();
    const original = await f.plan([[alpha()], [beta()]]);
    const reordered = await f.plan([[beta(), alpha()]]);
    requireApprovedPlan(original.sha256, reordered.sha256);
    expect(reordered.sha256).toBe(original.sha256);
  });

  it('refuses an additional public workspace even outside packages/', async () => {
    const f = fixture();
    const approved = await f.plan([[alpha()]]);
    const extra = await f.plan([[alpha(), beta()]]);
    expect(extra.sha256).not.toBe(approved.sha256);
    expect(() => requireApprovedPlan(approved.sha256, extra.sha256)).toThrow();
  });

  it('requires new approval when a partial publish reduces the remaining set', async () => {
    const f = fixture();
    const approved = await f.plan([[alpha(), beta()]]);
    const remaining = await f.plan([[beta()]]);
    expect(() => requireApprovedPlan(approved.sha256, remaining.sha256)).toThrow();
  });

  it.each([
    { tag: 'beta' },
    { access: 'restricted' },
  ])('refuses changed access or dist-tag: %j', async (change) => {
    const f = fixture();
    const approved = await f.plan([[alpha()]]);
    const changed = await f.plan([[release('@gertsai/alpha', '1.0.0', change)]]);
    expect(() => requireApprovedPlan(approved.sha256, changed.sha256)).toThrow();
  });

  it('refuses a version change instead of reusing the old approval', async () => {
    const f = fixture();
    const approved = await f.plan([[alpha()]]);
    const manifestPath = path.join(f.root, 'packages/alpha/package.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    fs.writeFileSync(manifestPath, JSON.stringify({ ...manifest, version: '1.0.1' }));
    const changed = await f.plan([[release('@gertsai/alpha', '1.0.1')]]);
    expect(() => requireApprovedPlan(approved.sha256, changed.sha256)).toThrow();
  });

  it.each([undefined, '', 'f'.repeat(63), 'g'.repeat(64)])('refuses a missing or malformed approval digest', (value) => {
    expect(() => requireApprovedPlan(value, 'a'.repeat(64))).toThrow();
  });
});

describe('native plans cannot escape the reviewed workspace policy', () => {
  it.each([
    { reason: 'private package', entries: [release('@gertsai/private', '9.0.0')] },
    { reason: 'unknown package', entries: [release('@gertsai/unknown', '1.0.0')] },
    { reason: 'mismatched version', entries: [release('@gertsai/alpha', '1.0.1')] },
    { reason: 'private tag-only release', entries: [release('@gertsai/alpha', '1.0.0', { kind: 'tag-only' })] },
    { reason: 'duplicate package', entries: [alpha(), alpha()] },
  ])('refuses $reason', async ({ entries }) => {
    const f = fixture();
    await expect(f.plan([entries])).rejects.toThrow();
  });

  it('checks the registry of every public workspace, including unplanned examples', async () => {
    const f = fixture();
    const manifestPath = path.join(f.root, 'examples/beta/package.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    fs.writeFileSync(manifestPath, JSON.stringify({ ...manifest, publishConfig: { registry: 'https://registry.npmjs.org' } }));
    await expect(f.plan([[alpha()]])).rejects.toThrow();
  });

  it('refuses an unsupported native plan format instead of silently dropping entries', async () => {
    const f = fixture();
    await expect(f.plan([[alpha()]], { version: 2 })).rejects.toThrow();
  });
});

describe('packed archives retain the approved publication identity', () => {
  it('preserves approval while adding real tarball metadata', async () => {
    const f = fixture();
    const approved = await f.plan([[alpha()]]);
    const packed = await f.plan([[f.archive()]], {}, { packed: true });
    requireApprovedPlan(approved.sha256, packed.sha256);
    expect(packed.sha256).toBe(approved.sha256);
  });

  it.each([
    { name: '@gertsai/other' },
    { version: '9.0.0' },
    { publishConfig: { registry: 'https://registry.npmjs.org' } },
  ])('refuses different tarball identity or registry: %j', async (change) => {
    const f = fixture();
    await expect(f.plan([[f.archive(change)]], {}, { packed: true })).rejects.toThrow();
  });

  it('refuses missing tarballs and paths outside the pack directory', async () => {
    const f = fixture();
    await expect(f.plan([[alpha()]], {}, { packed: true })).rejects.toThrow();
    f.archive();
    await expect(f.plan([[{ ...alpha(), tarball: { path: '../alpha.tgz' } }]], {}, { packed: true, planPath: path.join(f.root, 'packed/plan.json') })).rejects.toThrow();
  });
});

describe('preview candidate is an exact current main commit', () => {
  it.each(['main', 'a'.repeat(39), 'g'.repeat(40)])('refuses a non-SHA candidate: %s', async (expectedSha) => {
    await expect(verifyCandidate(candidate({ expectedSha }))).rejects.toThrow();
  });

  it('refuses a different dispatched commit', async () => {
    await expect(verifyCandidate(candidate({ expectedSha: 'b'.repeat(40) }))).rejects.toThrow();
  });

  it('refuses a non-main dispatch', async () => {
    const input = candidate();
    input.context.ref = 'refs/heads/feature';
    await expect(verifyCandidate(input)).rejects.toThrow();
  });

  it('revokes a previously valid preview when main advances', async () => {
    const input = candidate();
    await verifyCandidate(input);
    input.github.rest.repos.getBranch = async () => ({ data: { commit: { sha: 'b'.repeat(40) } } });
    await expect(verifyCandidate(input)).rejects.toThrow();
  });
});
