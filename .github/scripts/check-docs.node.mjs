// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { checkDocs, entrypoints } from './check-docs.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'shared-doc-navigation-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const path of entrypoints) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), '# Documentation\n');
  }
  await mkdir(join(root, 'packages/example'), { recursive: true });
  await writeFile(join(root, 'packages/example/package.json'), JSON.stringify({
    name: '@gertsai/example', exports: { '.': './index.js', './public': './public.js' },
  }));
  await writeFile(join(root, 'packages/example/README.md'), '# Example\n');
  await writeFile(join(root, 'packages/INDEX.md'), '# Packages\n[Example](example/README.md)\n');
  return root;
}

test('a missing file is a failed retrieval route, not a successful fallback', async t => {
  const root = await fixture(t);
  await writeFile(join(root, 'README.md'), '# Entry\n[Install](missing.md)\n');
  const result = await checkDocs(root);
  assert.ok(result.errors.some(error => error.code === 'missing_target' && error.target === 'missing.md'));
});

test('a renamed heading invalidates its old route', async t => {
  const root = await fixture(t);
  await writeFile(join(root, 'README.md'), '# Entry\n[Install](guides/INDEX.md#removed-section)\n');
  const result = await checkDocs(root);
  assert.ok(result.errors.some(error => error.code === 'missing_anchor' && error.target.endsWith('#removed-section')));
});

test('unknown package imports do not pass as public API examples', async t => {
  const root = await fixture(t);
  await writeFile(join(root, 'README.md'), "# Entry\n```ts\nimport { value } from '@gertsai/missing';\n```\n");
  const result = await checkDocs(root);
  assert.ok(result.errors.some(error => error.code === 'unknown_package' && error.target === '@gertsai/missing'));
});

test('an existing package does not make its private subpaths public', async t => {
  const root = await fixture(t);
  await writeFile(join(root, 'README.md'), "# Entry\n```js\nconst value = require('@gertsai/example/src/private');\n```\n");
  const result = await checkDocs(root);
  assert.ok(result.errors.some(error => error.code === 'private_import' && error.target === '@gertsai/example/src/private'));
});

test('symlinks cannot make a route read outside the selected repository', async t => {
  const root = await fixture(t);
  const outside = await mkdtemp(join(tmpdir(), 'shared-doc-outside-'));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await writeFile(join(outside, 'private.md'), '# Private\n');
  await symlink(join(outside, 'private.md'), join(root, 'escape.md'));
  await writeFile(join(root, 'README.md'), '# Entry\n[Data](escape.md)\n');
  const result = await checkDocs(root);
  assert.ok(result.errors.some(error => error.code === 'outside_root' && error.target === 'escape.md'));
});

test('Unicode and duplicate heading routes resolve while fenced fake headings do not', async t => {
  const root = await fixture(t);
  await writeFile(join(root, 'README.md'), '# Entry\n[First](#раздел)\n[Second](#раздел-1)\n[False](#hidden)\n## Раздел\n## Раздел\n```md\n## hidden\n[not a link](missing.md)\n```\n');
  const result = await checkDocs(root);
  assert.deepEqual(result.errors.map(error => [error.code, error.target]), [['missing_anchor', '#hidden']]);
});

test('a new package cannot silently disappear from the catalog', async t => {
  const root = await fixture(t);
  await writeFile(join(root, 'packages/INDEX.md'), '# Packages\n');
  const result = await checkDocs(root);
  assert.ok(result.errors.some(error => error.code === 'uncatalogued_package' && error.target === 'example'));
});

test('a more specific null wildcard blocks a broader public pattern', async t => {
  const root = await fixture(t);
  await writeFile(join(root, 'packages/example/package.json'), JSON.stringify({
    name: '@gertsai/example', exports: { './*': './dist/*.js', './internal/*': null },
  }));
  await writeFile(join(root, 'README.md'), "# Entry\n```ts\nimport { value } from '@gertsai/example/internal/private';\n```\n");
  const result = await checkDocs(root);
  assert.ok(result.errors.some(error => error.code === 'private_import' && error.target === '@gertsai/example/internal/private'));
});

test('unsupported reference-style routes fail explicitly rather than escaping validation', async t => {
  const root = await fixture(t);
  await writeFile(join(root, 'README.md'), '# Entry\n[Install][install]\n[install]: missing.md\n');
  const result = await checkDocs(root);
  assert.ok(result.errors.some(error => error.code === 'unsupported_link_syntax'));
});

test('public imports, query links, raw repository URLs and explicit anchors form a valid route', async t => {
  const root = await fixture(t);
  await writeFile(join(root, 'guides/INDEX.md'), '# Guide\n<a id="approved"></a>\n');
  await writeFile(join(root, 'README.md'), "# Entry\n[Query](guides/INDEX.md?plain=1#approved)\n[Raw](https://raw.githubusercontent.com/gertsai/shared/main/guides/INDEX.md#approved)\n```ts\nimport { value } from '@gertsai/example';\nimport { other } from '@gertsai/example/public';\n```\n");
  const result = await checkDocs(root);
  assert.deepEqual(result.errors, []);
});

test('a symlinked entrypoint is rejected before processing its external contents', async t => {
  const root = await fixture(t);
  const outside = await mkdtemp(join(tmpdir(), 'shared-doc-entry-'));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await writeFile(join(outside, 'external.md'), "# Private\nimport { value } from '@gertsai/private-leak';\n");
  await rm(join(root, 'README.md'));
  await symlink(join(outside, 'external.md'), join(root, 'README.md'));
  const result = await checkDocs(root);
  assert.ok(result.errors.some(error => error.code === 'outside_root' && error.source === 'README.md'));
  assert.ok(!result.errors.some(error => error.target === '@gertsai/private-leak'));
});

test('a symlinked package manifest is rejected before parsing external metadata', async t => {
  const root = await fixture(t);
  const outside = await mkdtemp(join(tmpdir(), 'shared-doc-manifest-'));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await writeFile(join(outside, 'package.json'), 'not JSON: must not be read');
  await rm(join(root, 'packages/example/package.json'));
  await symlink(join(outside, 'package.json'), join(root, 'packages/example/package.json'));
  const result = await checkDocs(root);
  assert.ok(result.errors.some(error => error.code === 'outside_root' && error.source === 'packages/example/package.json'));
});

test('a symlinked packages root is rejected before enumerating external files', async t => {
  const root = await fixture(t);
  const outside = await mkdtemp(join(tmpdir(), 'shared-doc-packages-'));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await rm(join(root, 'packages'), { recursive: true });
  await symlink(outside, join(root, 'packages'));
  const result = await checkDocs(root);
  assert.ok(result.errors.some(error => error.code === 'outside_root' && error.source === 'packages'));
});
