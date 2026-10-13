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
 * authors), and removes the flag. Each draft is checked against the same
 * schema the site builds with before it is written.
 *
 * A repo is skipped when an existing entry already links to it
 * (`links.repo`), when a file of the same name exists (files are NEVER
 * overwritten), or when it is listed in `scripts/ingest-skip.txt`.
 *
 *   node scripts/fetch-github-projects.mjs            # write new drafts
 *   node scripts/fetch-github-projects.mjs --dry-run  # show what it would write
 *
 * Set GITHUB_TOKEN in the environment for a higher API rate limit (optional).
 */

import { writeFile, mkdir, access, readdir, readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { entrySchema, SUMMARY_MAX } from '../src/lib/entry.ts';

const ORG = 'CMLPlatform';
const TOPIC = 'cml-showcase';
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, '..', 'src', 'content', 'projects');
const SKIP_FILE = join(HERE, 'ingest-skip.txt');
const EXCERPT_MAX = 600;

// ── pure helpers ────────────────────────────────────────────────────────────

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

/** Compare repo URLs loosely: case, trailing slash and `.git` don't matter. */
export function normRepoUrl(url) {
  return String(url).trim().toLowerCase().replace(/\.git$/, '').replace(/\/+$/, '');
}

/** The `links.repo` URL in an entry file's frontmatter, if any. */
export function repoLinkOf(fileText) {
  const front = /^---\n([\s\S]*?)\n---/.exec(fileText)?.[1] ?? '';
  // shortcut: a line regex, not a YAML parser; enough for the flat `links:` block entries use.
  const m = /^\s+repo:\s*["']?([^"'\s#]+)/m.exec(front);
  return m ? normRepoUrl(m[1]) : null;
}

/** Repo full names (owner/name) in the skip list: one per line, `#` comments. */
export function parseSkipList(text) {
  return new Set(
    String(text)
      .split('\n')
      .map((l) => l.replace(/#.*/, '').trim().toLowerCase())
      .filter(Boolean),
  );
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

/** The draft entry's frontmatter fields, validated against the site's schema. */
export function toEntryFields(repo) {
  const fields = {
    name: repo.name,
    summary: truncate(repo.description || repo.name, SUMMARY_MAX),
    authors: ['TODO: add author(s)'],
    department: 'Industrial Ecology', // TODO: verify (schema needs a valid value)
    type: 'software', // TODO: verify (software | data | model | other)
    tags: (repo.topics || []).filter((t) => t !== TOPIC).slice(0, 8),
    links: {},
    draft: true,
  };
  if (repo.html_url) fields.links.repo = repo.html_url;
  // GitHub lets owners type a homepage without a scheme; the schema needs a full URL.
  if (/^https?:\/\//i.test(repo.homepage || '')) fields.links.demo = repo.homepage;
  entrySchema.parse(fields);
  return fields;
}

export function toEntryFile(repo, excerpt) {
  const fields = toEntryFields(repo);
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
  if (!res.ok) {
    const err = new Error(`GitHub ${res.status} for ${path}: ${await res.text()}`);
    err.status = res.status;
    throw err;
  }
  return accept.includes('raw') ? res.text() : res.json();
}

async function exists(p) {
  return access(p).then(() => true).catch(() => false);
}

const github = {
  async fetchRepos() {
    const search = await gh(`/search/repositories?q=org:${ORG}+topic:${TOPIC}&per_page=100`);
    return search.items || [];
  },
  async readme(fullName) {
    try {
      return await gh(`/repos/${fullName}/readme`, 'application/vnd.github.raw+json');
    } catch (err) {
      if (err.status === 404) return ''; // no README
      throw err; // rate limit or outage: fail the run rather than write a body-less draft
    }
  },
};

/** Repo URLs that existing entries (published, draft or template) already link to. */
async function linkedRepos(outDir) {
  const files = await readdir(outDir).catch(() => []);
  const urls = new Set();
  for (const f of files.filter((f) => /\.mdx?$/.test(f))) {
    const url = repoLinkOf(await readFile(join(outDir, f), 'utf8'));
    if (url) urls.add(url);
  }
  return urls;
}

export async function main({
  outDir = OUT_DIR,
  skipFile = SKIP_FILE,
  dryRun = false,
  fetchRepos = github.fetchRepos,
  readme = github.readme,
  log = console.log,
} = {}) {
  const repos = await fetchRepos();
  log(`Found ${repos.length} repo(s) tagged "${TOPIC}" in ${ORG}.`);
  const linked = await linkedRepos(outDir);
  const skipList = parseSkipList(await readFile(skipFile, 'utf8').catch(() => ''));

  let written = 0, skipped = 0;
  for (const repo of repos) {
    const file = join(outDir, `${slugify(repo.name)}.md`);
    const reason = skipList.has(repo.full_name.toLowerCase())
      ? 'listed in ingest-skip.txt'
      : linked.has(normRepoUrl(repo.html_url))
        ? 'an entry already links to it'
        : (await exists(file)) || (await exists(`${file}x`))
          ? 'a file of that name exists, not overwritten'
          : null;
    if (reason) {
      log(`  skip  ${repo.name} (${reason})`);
      skipped++;
      continue;
    }
    const contents = toEntryFile(repo, readmeExcerpt(await readme(repo.full_name)));
    if (dryRun) {
      log(`\n─── would write ${file} ───\n${contents}`);
    } else {
      await mkdir(outDir, { recursive: true });
      await writeFile(file, contents);
      log(`  draft ${repo.name} → ${file}`);
    }
    written++;
  }
  log(`\n${dryRun ? '[dry-run] ' : ''}${written} draft(s) ${dryRun ? 'to write' : 'written'}, ${skipped} skipped.`);
  return { written, skipped };
}

// Only act when run directly (`node …` / npm run ingest), not when imported.
const runDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (runDirectly) {
  main({ dryRun: process.argv.includes('--dry-run') }).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
