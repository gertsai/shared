// SPDX-License-Identifier: Apache-2.0
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const entrypoints = [
  'README.md', 'guides/INDEX.md', 'guides/AI-CONSUMER-GUIDE.md',
  'guides/CONSUMING-PACKAGES.ru.md', 'guides/BUILDING-APPS.md',
  'guides/CONSUMER-CONTEXT.md', 'guides/CONTEXT7.md',
  'packages/INDEX.md', 'examples/INDEX.md', 'llms.txt',
];

function prose(text) {
  let fence;
  return text.split('\n').map(line => {
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = undefined;
      return '';
    }
    return fence ? '' : line;
  }).join('\n');
}

function headingIds(text) {
  const ids = new Set();
  const seen = new Map();
  const body = prose(text);
  for (const match of body.matchAll(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const base = match[1].replace(/<[^>]*>/g, '').toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}_\-\s]/gu, '').replace(/\s/g, '-');
    let id = base;
    let suffix = seen.get(base) ?? 0;
    while (ids.has(id)) id = `${base}-${++suffix}`;
    seen.set(base, suffix);
    ids.add(id);
  }
  for (const match of body.matchAll(/<a\s+[^>]*(?:id|name)=["']([^"']+)["'][^>]*>/gi)) ids.add(match[1]);
  return ids;
}

function links(text) {
  return [...prose(text).matchAll(/!?\[[^\]\n]*\]\((?:<([^>]+)>|([^\s)]+))(?:\s+["'][^\n]*?["'])?\)/g)]
    .map(match => match[1] ?? match[2]);
}

function localLink(value) {
  if (value.startsWith('https://raw.githubusercontent.com/gertsai/shared/main/')) {
    return value.slice('https://raw.githubusercontent.com/gertsai/shared/main/'.length);
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(value) || value.startsWith('//')) return null;
  return value;
}

function exported(manifest, subpath) {
  const key = subpath ? `./${subpath}` : '.';
  const exports = manifest.exports;
  if (!exports) return key === '.';
  if (typeof exports === 'string' || Array.isArray(exports)) return key === '.';
  if (!Object.keys(exports).some(name => name.startsWith('.'))) return key === '.';
  if (Object.hasOwn(exports, key)) return exports[key] !== null;
  const matches = Object.entries(exports).filter(([pattern]) => {
    if (!pattern.includes('*')) return false;
    const [prefix, suffix] = pattern.split('*');
    return key.startsWith(prefix) && key.endsWith(suffix) && key.length >= prefix.length + suffix.length;
  }).sort(([left], [right]) => right.indexOf('*') - left.indexOf('*') || right.length - left.length);
  return matches.length > 0 && matches[0][1] !== null;
}

/** Validate the curated entrypoints, not every historical document in the repository. */
export async function checkDocs(rootDirectory) {
  const root = await realpath(rootDirectory);
  const errors = [];
  const documents = new Map();
  const packages = new Map();
  let checkedLinks = 0;
  let checkedImports = 0;
  const inside = path => { const rel = relative(root, path); return !isAbsolute(rel) && rel !== '..' && !rel.startsWith('../'); };
  const fail = (code, source, target, message) => errors.push({ code, source, target, message });

  const confined = async source => {
    const actual = await realpath(resolve(root, source));
    if (!inside(actual)) {
      fail('outside_root', source, source, 'Input symlink leaves repository');
      return null;
    }
    return actual;
  };
  const packageRoot = await confined('packages');
  const packageEntries = packageRoot ? await readdir(packageRoot, { withFileTypes: true }) : [];
  for (const entry of packageEntries) {
    if (!entry.isDirectory()) continue;
    let manifest;
    try {
      const manifestPath = await confined(`packages/${entry.name}/package.json`);
      if (!manifestPath) continue;
      manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    packages.set(manifest.name, { manifest, directory: entry.name });
  }
  for (const source of entrypoints) {
    try {
      const documentPath = await confined(source);
      if (documentPath) documents.set(source, await readFile(documentPath, 'utf8'));
    }
    catch (error) { if (error.code !== 'ENOENT') throw error; fail('missing_document', source, source, 'Required entrypoint is missing'); }
  }
  for (const [source, text] of documents) {
    for (const match of prose(text).matchAll(/^ {0,3}\[[^\]]+\]:\s*\S+|<a\b[^>]*\bhref\s*=/gim)) {
      fail('unsupported_link_syntax', source, match[0], 'Curated routes require inline Markdown links; HTML anchors without href are supported');
    }
    for (const value of links(text)) {
      const local = localLink(value);
      if (local === null) continue;
      checkedLinks++;
      const split = local.indexOf('#');
      let pathPart;
      let fragment;
      try {
        const pathname = split < 0 ? local : local.slice(0, split);
        pathPart = decodeURIComponent(pathname.split('?')[0]);
        fragment = split < 0 ? '' : decodeURIComponent(local.slice(split + 1));
      } catch { fail('invalid_link', source, value, 'Invalid URL encoding'); continue; }
      const absolute = value.startsWith('https://raw.githubusercontent.com/')
        ? resolve(root, pathPart) : resolve(dirname(resolve(root, source)), pathPart || '.');
      const target = pathPart ? absolute : resolve(root, source);
      if (!inside(target)) { fail('outside_root', source, value, 'Link leaves repository'); continue; }
      let actual;
      try { actual = await realpath(target); }
      catch (error) { if (error.code !== 'ENOENT') throw error; fail('missing_target', source, value, 'Link target does not exist'); continue; }
      if (!inside(actual)) { fail('outside_root', source, value, 'Symlink target leaves repository'); continue; }
      if (fragment && /\.(?:md|txt)$/i.test(actual) && (await stat(actual)).isFile()) {
        const targetText = await readFile(actual, 'utf8');
        if (!headingIds(targetText).has(fragment)) fail('missing_anchor', source, value, 'Heading or explicit anchor does not exist');
      }
    }
    for (const match of text.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?|\brequire\s*\(\s*)['"](@gertsai\/[^'"\s]+)['"]/g)) {
      checkedImports++;
      const [, specifier] = match;
      const parts = specifier.split('/');
      const name = parts.slice(0, 2).join('/');
      const item = packages.get(name);
      if (!item) fail('unknown_package', source, specifier, 'Package is absent from workspace manifests');
      else if (!exported(item.manifest, parts.slice(2).join('/'))) fail('private_import', source, specifier, 'Import is not a public export');
    }
  }
  const catalog = documents.get('packages/INDEX.md') ?? '';
  const catalogTargets = new Set(links(catalog).map(localLink));
  for (const { directory } of packages.values()) {
    if (!catalogTargets.has(`${directory}/README.md`)) fail('uncatalogued_package', 'packages/INDEX.md', directory, 'Package README is absent from catalog');
  }
  return { documents: documents.size, packages: packages.size, checkedLinks, checkedImports, errors };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] ?? resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  try {
    const result = await checkDocs(root);
    for (const error of result.errors) console.error(`${error.code}: ${error.source} -> ${error.target}: ${error.message}`);
    console.log(JSON.stringify({ ...result, errors: result.errors.length }));
    if (result.errors.length) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
