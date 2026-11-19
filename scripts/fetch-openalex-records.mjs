#!/usr/bin/env node
/**
 * OPTIONAL automated ingestion, the second source next to fetch-github-projects.mjs.
 *
 * Asks OpenAlex for the datasets and software that Leiden University authors
 * with a CML ("Institute of Environmental Sciences") affiliation deposited on
 * Zenodo, and writes a DRAFT gallery entry for each one: title, authors, DOI,
 * type and the record's description. Drafts carry `draft: true`, so nothing is
 * published until a maintainer checks `department`, writes a summary that says
 * what the project is, and removes the flag. Existing files are never overwritten.
 *
 *   node scripts/fetch-openalex-records.mjs            # write new drafts
 *   node scripts/fetch-openalex-records.mjs --dry-run  # show what it would write
 */

import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { entrySchema } from '../src/lib/entry.ts';
import { bareDoi, parseSkipList, slugify, truncate, yamlValue } from './fetch-github-projects.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, '..', 'src', 'content', 'projects');
const SKIP_FILE = join(HERE, 'ingest-skip.txt');
const LEIDEN = 'I121797337'; // OpenAlex has no separate institution for CML
const BODY_MAX = 600;
// shortcut: a raw-affiliation text match, so a record whose authors give only "Leiden University" is missed.
const FILTER = [
  `institutions.id:${LEIDEN}`,
  'raw_affiliation_strings.search:"Institute of Environmental Sciences"',
  'type:dataset|software',
  'doi_starts_with:10.5281/zenodo', // Zenodo only: other hosts add supplement fragments and taxon records
].join(',');
const TYPES = { dataset: 'data', software: 'software' };

/** Rebuild plain text from OpenAlex's `abstract_inverted_index`. */
export function abstractText(index) {
  if (!index) return '';
  const words = [];
  for (const [word, positions] of Object.entries(index)) for (const p of positions) words[p] = word;
  return words.join(' ').replace(/\s+/g, ' ').trim();
}

/** The bare `doi:` in an entry file's frontmatter, lower-case, if any. */
export function doiOf(fileText) {
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(fileText)?.[1] ?? '';
  const m = /^doi:\s*["']?([^"'\s#]+)/m.exec(front);
  return m ? m[1].toLowerCase() : null;
}

/** The draft entry's frontmatter fields, validated against the site's schema. */
export function toEntryFields(work) {
  const fields = {
    name: work.title,
    summary: 'TODO: one line on what it is',
    authors: work.authorships.map((a) => a.author?.display_name).filter(Boolean),
    department: 'Industrial Ecology', // TODO: verify (schema needs a valid value)
    type: TYPES[work.type],
    tags: [],
    doi: bareDoi(work.doi).toLowerCase(),
    links: {},
    draft: true,
  };
  if (!fields.authors.length) fields.authors = ['TODO: add author(s)'];
  entrySchema.parse(fields);
  return fields;
}

export function toEntryFile(work) {
  const f = toEntryFields(work);
  const body = truncate(abstractText(work.abstract_inverted_index), BODY_MAX);
  return [
    '---',
    '# ─────────────────────────────────────────────────────────────',
    `# AUTO-GENERATED DRAFT from OpenAlex ${work.id}: review before publishing.`,
    '# Check `department`, `authors` and `type`, write the summary, then remove `draft: true`.',
    '# ─────────────────────────────────────────────────────────────',
    `name: ${yamlValue(f.name)}`,
    `summary: ${yamlValue(f.summary)}`,
    `authors:${yamlValue(f.authors)}`,
    `department: ${yamlValue(f.department)}`,
    `type: ${yamlValue(f.type)}`,
    'tags: []',
    `doi: ${yamlValue(f.doi)}`,
    'draft: true',
    '---',
    '',
    body || '_No description available. Add one here._',
    '',
  ].join('\n');
}

async function fetchWorks() {
  const works = [];
  for (let cursor = '*'; cursor; ) {
    const url = `https://api.openalex.org/works?filter=${encodeURIComponent(FILTER)}&per-page=100&cursor=${cursor}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'cml-gallery-ingest (https://github.com/CMLPlatform/cml-gallery)' } });
    if (!res.ok) throw new Error(`OpenAlex ${res.status}: ${await res.text()}`);
    const page = await res.json();
    works.push(...page.results);
    cursor = page.results.length ? page.meta.next_cursor : null;
  }
  return works;
}

/** DOIs that existing entries (published, draft or template) already carry. */
async function knownDois(outDir) {
  const files = await readdir(outDir, { recursive: true }).catch(() => []);
  const dois = new Set();
  for (const f of files.filter((f) => /\.mdx?$/.test(f))) {
    const doi = doiOf(await readFile(join(outDir, f), 'utf8'));
    if (doi) dois.add(doi);
  }
  return dois;
}

export async function main({ outDir = OUT_DIR, skipFile = SKIP_FILE, dryRun = false, works = fetchWorks, log = console.log } = {}) {
  const found = (await works()).filter((w) => w.title && w.doi && TYPES[w.type]);
  log(`Found ${found.length} CML dataset or software record(s) on OpenAlex.`);
  const known = await knownDois(outDir);
  const skipList = parseSkipList(await readFile(skipFile, 'utf8').catch(() => ''));
  const names = new Set(); // Zenodo versions share a title, so draft the first one only

  let written = 0, skipped = 0;
  for (const work of found) {
    const doi = bareDoi(work.doi).toLowerCase();
    const slug = slugify(work.title);
    const file = join(outDir, `${slug}.md`);
    const reason = skipList.has(doi)
      ? 'listed in ingest-skip.txt'
      : known.has(doi)
        ? 'an entry already has this DOI'
        : names.has(slug) || existsSync(file) || existsSync(`${file}x`)
          ? 'a file of that name exists, not overwritten'
          : null;
    names.add(slug);
    if (reason) {
      log(`  skip  ${doi} (${reason})`);
      skipped++;
      continue;
    }
    let contents;
    try {
      contents = toEntryFile(work);
    } catch (err) {
      if (!err?.issues) throw err;
      log(`  skip  ${doi} (draft fails the schema: ${err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')})`);
      skipped++;
      continue;
    }
    if (dryRun) {
      log(`\n─── would write ${file} ───\n${contents}`);
    } else {
      await mkdir(outDir, { recursive: true });
      await writeFile(file, contents);
      log(`  draft ${doi} → ${file}`);
    }
    written++;
  }
  log(`\n${dryRun ? '[dry-run] ' : ''}${written} draft(s) ${dryRun ? 'to write' : 'written'}, ${skipped} skipped.`);
  return { written, skipped };
}

const runDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (runDirectly) {
  main({ dryRun: process.argv.includes('--dry-run') }).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
