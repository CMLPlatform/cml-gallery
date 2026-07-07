#!/usr/bin/env node
/**
 * OPTIONAL automated ingestion (Step 3).
 *
 * Fetches public repositories in the CMLPlatform GitHub org that carry the
 * `cml-showcase` topic and writes a DRAFT gallery entry for each one, derived
 * from the repo's metadata (description, homepage, topics, README excerpt).
 *
 * Drafts are written with `draft: true`, so they're excluded from the built
 * site until a maintainer reviews one, fills the TODO fields (department,
 * authors), and removes the flag. Existing files are NEVER overwritten, so
 * hand-authored and already-promoted entries are safe.
 *
 *   node scripts/fetch-github-projects.mjs            # write new drafts
 *   node scripts/fetch-github-projects.mjs --dry-run  # show what it would write
 *   node scripts/fetch-github-projects.mjs --selftest # run the helper asserts
 *
 * Set GITHUB_TOKEN in the environment for a higher API rate limit (optional).
 */

import { writeFile, mkdir, access } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const ORG = 'CMLPlatform';
const TOPIC = 'cml-showcase';
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'content', 'projects');
const SUMMARY_MAX = 160; // must match the schema
const EXCERPT_MAX = 600;

// ── pure helpers (covered by --selftest) ────────────────────────────────────

export function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function truncate(text, max) {
  const t = String(text).trim();
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + '…';
}

/** Pull the first real paragraph out of a README, skipping title/badges/code. */
export function readmeExcerpt(md) {
  const lines = String(md).split('\n');
  const para = [];
  let inFence = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('```')) { inFence = !inFence; continue; }
    if (inFence) continue;
    if (!line) { if (para.length) break; else continue; }
    if (line.startsWith('#')) continue; // heading
    if (/^!?\[[^\]]*\]\([^)]*\)$/.test(line)) continue; // lone image/badge line
    if (/^[-=]{3,}$/.test(line)) continue; // setext underline / hr
    para.push(line);
  }
  return truncate(para.join(' ').replace(/\s+/g, ' '), EXCERPT_MAX);
}

/** Serialise a value as a YAML scalar/array (double-quoted strings are safe). */
function yamlValue(v) {
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    return '\n' + v.map((x) => `  - ${JSON.stringify(String(x))}`).join('\n');
  }
  if (typeof v === 'boolean') return String(v);
  return JSON.stringify(String(v));
}

export function toEntryFile(repo, excerpt) {
  const tags = (repo.topics || []).filter((t) => t !== TOPIC).slice(0, 8);
  const fields = {
    name: repo.name,
    summary: truncate(repo.description || repo.name, SUMMARY_MAX),
    authors: ['TODO: add author(s)'],
    department: 'Industrial Ecology', // TODO: verify (schema needs a valid value)
    type: 'software', // TODO: verify (software | data | model | other)
    tags,
    links: {},
  };
  if (repo.html_url) fields.links.repo = repo.html_url;
  if (repo.homepage) fields.links.demo = repo.homepage;

  const lines = [
    '---',
    '# ─────────────────────────────────────────────────────────────',
    `# AUTO-GENERATED DRAFT from ${repo.full_name}: review before publishing.`,
    '# Fill in `department` and `authors`, then remove `draft: true`.',
    '# ─────────────────────────────────────────────────────────────',
    `name: ${yamlValue(fields.name)}`,
    `summary: ${yamlValue(fields.summary)}`,
    `authors:${yamlValue(fields.authors)}`,
    `department: ${yamlValue(fields.department)}`,
    `type: ${yamlValue(fields.type)}`,
    `tags:${yamlValue(fields.tags)}`,
    'links:',
    ...Object.entries(fields.links).map(([k, v]) => `  ${k}: ${yamlValue(v)}`),
    'draft: true',
    '---',
    '',
    excerpt || '_No description available. Add one here._',
    '',
  ];
  return lines.join('\n');
}

// ── side-effecting bits ─────────────────────────────────────────────────────

async function gh(path, accept = 'application/vnd.github+json') {
  const headers = { Accept: accept, 'User-Agent': 'cml-gallery-ingest' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (!res.ok) throw new Error(`GitHub ${res.status} for ${path}: ${await res.text()}`);
  return accept.includes('raw') ? res.text() : res.json();
}

async function exists(p) {
  return access(p).then(() => true).catch(() => false);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const search = await gh(`/search/repositories?q=org:${ORG}+topic:${TOPIC}&per_page=100`);
  const repos = search.items || [];
  console.log(`Found ${repos.length} repo(s) tagged "${TOPIC}" in ${ORG}.`);

  let written = 0, skipped = 0;
  for (const repo of repos) {
    const file = join(OUT_DIR, `${slugify(repo.name)}.md`);
    if (await exists(file)) {
      console.log(`  skip  ${repo.name} (entry already exists, not overwritten)`);
      skipped++;
      continue;
    }
    let excerpt = '';
    try {
      excerpt = readmeExcerpt(await gh(`/repos/${repo.full_name}/readme`, 'application/vnd.github.raw+json'));
    } catch {
      /* no README, leave excerpt empty */
    }
    const contents = toEntryFile(repo, excerpt);
    if (dryRun) {
      console.log(`\n─── would write ${file} ───\n${contents}`);
    } else {
      await mkdir(OUT_DIR, { recursive: true });
      await writeFile(file, contents);
      console.log(`  draft ${repo.name} → ${file}`);
    }
    written++;
  }
  console.log(`\n${dryRun ? '[dry-run] ' : ''}${written} draft(s) ${dryRun ? 'to write' : 'written'}, ${skipped} skipped.`);
}

function selftest() {
  assert.equal(slugify('Material Flow Explorer!'), 'material-flow-explorer');
  assert.equal(slugify('--RELab--'), 'relab');
  assert.equal(truncate('hello world', 5), 'hell…');
  assert.equal(truncate('hi', 5), 'hi');
  assert.equal(
    readmeExcerpt('# Title\n\n![badge](x.png)\n\n```\ncode\n```\n\nReal text here.\n\nSecond para.'),
    'Real text here.',
  );
  const file = toEntryFile(
    { name: 'RELab', full_name: 'CMLPlatform/relab', description: 'x', topics: ['cml-showcase', 'fair'], html_url: 'https://h', homepage: '' },
    'body',
  );
  assert.match(file, /draft: true/);
  assert.match(file, /"fair"/);
  assert.doesNotMatch(file, /cml-showcase/); // the marker topic is stripped from tags
  console.log('selftest: all asserts passed');
}

// Only act when run directly (`node …` / npm run ingest), not when imported.
const runDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (process.argv.includes('--selftest')) selftest();
else if (runDirectly) main().catch((err) => { console.error(err.message); process.exit(1); });
