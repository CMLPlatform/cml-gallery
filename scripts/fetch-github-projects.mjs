#!/usr/bin/env node
/**
 * OPTIONAL automated ingestion (Step 3).
 *
 * Fetches public repositories in the CMLPlatform GitHub org that carry the
 * `cml-showcase` topic and writes a DRAFT gallery entry for each one, derived
 * from the repo's metadata (description, homepage, topics, licence, README
 * excerpt). When the repo has a CITATION.cff, or else a codemeta.json, its
 * authors and DOI fill the draft's `authors` and `doi`.
 *
 * Drafts are written with `draft: true`, so they're excluded from the built
 * site until a maintainer reviews one, fills the TODO fields (department,
 * and authors when no citation file named them), and removes the flag. Each
 * draft is checked against the same schema the site builds with before it is
 * written.
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

import { existsSync } from 'node:fs';
import { writeFile, mkdir, readdir, readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { parse as parseYaml } from 'yaml';
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
  let fence = ''; // the open fence's marker; only the same marker closes it
  for (const raw of lines) {
    const line = raw.trim();
    const marker = line.slice(0, 3);
    if (marker === '```' || marker === '~~~') {
      if (!fence) fence = marker;
      else if (fence === marker) fence = '';
      continue;
    }
    if (fence) continue;
    if (!line) { if (para.length) break; else continue; }
    if (line.startsWith('#')) continue; // heading
    if (/^(\[?!?\[[^\]]*\]\([^)]*\)(\]\([^)]*\))?\s*)+$/.test(line)) continue; // line of images or linked badges
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
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(fileText)?.[1] ?? '';
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

/** The bare DOI (`10.…/…`) in a string such as `https://doi.org/10.5281/zenodo.1`, if any. */
export function bareDoi(text) {
  return /\b(10\.\d{4,9}\/[^\s"'<>]+)/.exec(String(text ?? ''))?.[1];
}

/** Authors and DOI from a CITATION.cff: `authors:` names and the top-level `doi:`. */
export function parseCitationCff(text) {
  let cff;
  try {
    cff = parseYaml(text);
  } catch {
    return { authors: [] }; // a broken file leaves the TODO placeholder for a maintainer
  }
  const authors = [cff?.authors ?? []]
    .flat()
    .map((p) =>
      p?.name ??
      [p?.['given-names'], p?.['name-particle'], p?.['family-names'], p?.['name-suffix']].filter(Boolean).join(' '),
    )
    .filter(Boolean);
  return { authors, doi: bareDoi(cff?.doi) };
}

/** Authors and DOI from a codemeta.json (`author`, and `identifier` or `@id`). */
export function parseCodemeta(text) {
  let meta;
  try {
    meta = JSON.parse(text);
  } catch {
    return { authors: [] }; // a broken file leaves the TODO placeholder for a maintainer
  }
  const authors = [meta.author ?? []]
    .flat()
    .map((a) => (typeof a === 'string' ? a : (a.name ?? [a.givenName, a.familyName].filter(Boolean).join(' '))))
    .filter(Boolean);
  const doi = [meta.identifier, meta['@id']]
    .flat()
    .map((id) => bareDoi(typeof id === 'object' ? id?.value : id))
    .find(Boolean);
  return { authors, doi };
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

/**
 * The draft entry's frontmatter fields, validated against the site's schema.
 * `meta` holds the authors and DOI read from the repo's citation file, if any.
 */
export function toEntryFields(repo, meta = {}) {
  const fields = {
    name: repo.name,
    summary: truncate(repo.description || repo.name, SUMMARY_MAX),
    authors: meta.authors?.length ? meta.authors : ['TODO: add author(s)'],
    department: 'Industrial Ecology', // TODO: verify (schema needs a valid value)
    type: 'software', // TODO: verify (software | data | model | other)
    tags: (repo.topics || []).filter((t) => t !== TOPIC).slice(0, 8),
    links: {},
    draft: true,
  };
  // GitHub reports NOASSERTION for a licence file it cannot match to one SPDX id.
  const spdx = repo.license?.spdx_id;
  if (spdx && spdx !== 'NOASSERTION') fields.license = spdx;
  if (meta.doi) fields.doi = meta.doi;
  if (repo.html_url) fields.links.repo = repo.html_url;
  // GitHub lets owners type a homepage without a scheme; the schema needs a full URL.
  if (/^https?:\/\//i.test(repo.homepage || '')) fields.links.demo = repo.homepage;
  entrySchema.parse(fields);
  return fields;
}

export function toEntryFile(repo, excerpt, meta) {
  const fields = toEntryFields(repo, meta);
  const lines = [
    '---',
    '# ─────────────────────────────────────────────────────────────',
    `# AUTO-GENERATED DRAFT from ${repo.full_name}: review before publishing.`,
    '# Fill in or check `department` and `authors`, then remove `draft: true`.',
    '# ─────────────────────────────────────────────────────────────',
    `name: ${yamlValue(fields.name)}`,
    `summary: ${yamlValue(fields.summary)}`,
    `authors:${yamlValue(fields.authors)}`,
    `department: ${yamlValue(fields.department)}`,
    `type: ${yamlValue(fields.type)}`,
    `tags:${yamlValue(fields.tags)}`,
    ...['license', 'doi'].filter((k) => fields[k]).map((k) => `${k}: ${yamlValue(fields[k])}`),
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

/** The awaited value, or null when GitHub answers 404 (absent). Any other error is rethrown. */
export async function absentOn404(promise) {
  try {
    return await promise;
  } catch (err) {
    if (err.status === 404) return null;
    throw err; // rate limit or outage: fail the run rather than write a draft missing data
  }
}

const github = {
  async fetchRepos() {
    const search = await gh(`/search/repositories?q=org:${ORG}+topic:${TOPIC}&per_page=100`);
    return search.items || [];
  },
  async readme(fullName) {
    return (await absentOn404(gh(`/repos/${fullName}/readme`, 'application/vnd.github.raw+json'))) ?? '';
  },
  /** A file's text from the repo's default branch, or null when it does not exist. */
  repoFile(fullName, path) {
    return absentOn404(gh(`/repos/${fullName}/contents/${path}`, 'application/vnd.github.raw+json'));
  },
};

/** Authors and DOI from CITATION.cff, or from codemeta.json when there is no CITATION.cff. */
async function citationMeta(fullName, repoFile) {
  const cff = await repoFile(fullName, 'CITATION.cff');
  if (cff !== null) return parseCitationCff(cff);
  const codemeta = await repoFile(fullName, 'codemeta.json');
  return codemeta !== null ? parseCodemeta(codemeta) : {};
}

/** Repo URLs that existing entries (published, draft or template) already link to. */
async function linkedRepos(outDir) {
  // Recursive, like the content glob: an entry may live in its own folder (my-project/index.md).
  const files = await readdir(outDir, { recursive: true }).catch(() => []);
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
  repoFile = github.repoFile,
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
        : existsSync(file) || existsSync(`${file}x`)
          ? 'a file of that name exists, not overwritten'
          : null;
    if (reason) {
      log(`  skip  ${repo.name} (${reason})`);
      skipped++;
      continue;
    }
    let contents;
    try {
      contents = toEntryFile(
        repo,
        readmeExcerpt(await readme(repo.full_name)),
        await citationMeta(repo.full_name, repoFile),
      );
    } catch (err) {
      if (!err?.issues) throw err; // only a schema failure is this repo's problem
      // One repo with odd metadata must not cost the PR for the others.
      log(`  skip  ${repo.name} (draft fails the schema: ${err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')})`);
      skipped++;
      continue;
    }
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
