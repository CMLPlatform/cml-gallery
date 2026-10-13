import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { entrySchema } from '../src/lib/entry.ts';
import {
  absentOn404,
  bareDoi,
  main,
  parseCitationCff,
  parseCodemeta,
  parseSkipList,
  readmeExcerpt,
  repoLinkOf,
  slugify,
  toEntryFields,
  toEntryFile,
  truncate,
} from './fetch-github-projects.mjs';

const repo = (over = {}) => ({
  name: 'RELab',
  full_name: 'CMLPlatform/relab',
  description: 'Reverse engineering lab',
  topics: ['cml-showcase', 'fair'],
  html_url: 'https://github.com/CMLPlatform/relab',
  homepage: '',
  ...over,
});

test('pure helpers', () => {
  assert.equal(slugify('Material Flow Explorer!'), 'material-flow-explorer');
  assert.equal(slugify('--RELab--'), 'relab');
  assert.equal(truncate('hello world', 5), 'hell…');
  assert.equal(truncate('hi', 5), 'hi');
  assert.equal(
    readmeExcerpt('# Title\n\n![badge](x.png)\n\n```\ncode\n```\n\nReal text here.\n\nSecond para.'),
    'Real text here.',
  );
  assert.deepEqual(parseSkipList('# c\nCMLPlatform/Old  # gone\n\n'), new Set(['cmlplatform/old']));
  assert.equal(
    repoLinkOf('---\nname: x\nlinks:\n  repo: "https://github.com/CMLPlatform/relab/"\n---\n'),
    'https://github.com/cmlplatform/relab',
  );
  assert.equal(repoLinkOf('---\nname: x\n---\n'), null);
});

test('a draft is flagged, strips the marker topic and passes the schema', () => {
  const file = toEntryFile(repo(), 'body');
  assert.match(file, /^draft: true$/m);
  assert.match(file, /"fair"/);
  assert.doesNotMatch(file, /cml-showcase/);
});

test('a homepage without a scheme is dropped, not written as an invalid URL', () => {
  assert.equal(toEntryFields(repo({ homepage: 'cml.example.org' })).links.demo, undefined);
  assert.equal(
    toEntryFields(repo({ homepage: 'https://cml.example.org' })).links.demo,
    'https://cml.example.org',
  );
});

test('a TODO placeholder only passes while the entry is a draft', () => {
  const fields = toEntryFields(repo());
  assert.ok(entrySchema.safeParse(fields).success);
  const published = entrySchema.safeParse({ ...fields, draft: false });
  assert.equal(published.success, false);
  assert.deepEqual(
    published.error.issues.map((i) => i.path.join('.')),
    ['authors'],
  );
});

test('main skips linked, listed and existing repos and writes the rest', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ingest-'));
  try {
    const skipFile = join(dir, 'skip.txt');
    await writeFile(skipFile, 'CMLPlatform/declined\n');
    // Linked by URL under another file name, as sample-relab.md does.
    await writeFile(
      join(dir, 'sample-relab.md'),
      '---\nlinks:\n  repo: https://github.com/cmlplatform/RELab\n---\n',
    );
    await writeFile(join(dir, 'taken.mdx'), 'hand-written');
    const named = (name) =>
      repo({ name, full_name: `CMLPlatform/${name}`, html_url: `https://github.com/CMLPlatform/${name}` });
    const result = await main({
      outDir: dir,
      skipFile,
      fetchRepos: async () => [repo(), named('declined'), named('taken'), named('pycirk')],
      readme: async () => '# pycirk\n\nCircular economy scenarios.',
      repoFile: async () => null,
      log: () => {},
    });
    assert.deepEqual(result, { written: 1, skipped: 3 });
    assert.deepEqual((await readdir(dir)).sort(), [
      'pycirk.md',
      'sample-relab.md',
      'skip.txt',
      'taken.mdx',
    ]);
    assert.equal(await readFile(join(dir, 'taken.mdx'), 'utf8'), 'hand-written');
    assert.match(await readFile(join(dir, 'pycirk.md'), 'utf8'), /Circular economy scenarios\./);
  } finally {
    await rm(dir, { recursive: true });
  }
});

const CFF = `cff-version: 1.2.0
message: If you use this software, please cite it as below.
authors:
  - family-names: Lierde
    given-names: Simon
    name-particle: van
    affiliation: "CML, Leiden University"
  - name: "CML Leiden"
title: RELab
doi: 10.5281/zenodo.1234567 # concept DOI
preferred-citation:
  type: article
  authors:
    - family-names: Someone
  doi: "10.1016/j.paper.2026.1"
`;

const CODEMETA = JSON.stringify({
  '@context': 'https://w3id.org/codemeta/3.0',
  author: [{ '@type': 'Person', givenName: 'Ann', familyName: 'Bee' }, { name: 'CML Leiden' }],
  identifier: 'https://doi.org/10.5281/zenodo.7654321',
});

test('citation files give authors and the top-level DOI', () => {
  assert.deepEqual(parseCitationCff(CFF), {
    authors: ['Simon van Lierde', 'CML Leiden'],
    doi: '10.5281/zenodo.1234567',
  });
  assert.deepEqual(parseCitationCff('authors:\n- given-names: Ann\n  family-names: Bee\n'), {
    authors: ['Ann Bee'],
    doi: undefined,
  });
  assert.deepEqual(parseCodemeta(CODEMETA), {
    authors: ['Ann Bee', 'CML Leiden'],
    doi: '10.5281/zenodo.7654321',
  });
  assert.deepEqual(parseCodemeta('{ not json'), { authors: [] });
  assert.equal(bareDoi('https://doi.org/10.5281/zenodo.1'), '10.5281/zenodo.1');
  assert.equal(bareDoi('none'), undefined);
});

test('the SPDX licence is kept, NOASSERTION is not', () => {
  assert.equal(toEntryFields(repo({ license: { spdx_id: 'MIT' } })).license, 'MIT');
  assert.equal(toEntryFields(repo({ license: { spdx_id: 'NOASSERTION' } })).license, undefined);
  assert.equal(toEntryFields(repo({ license: null })).license, undefined);
});

test('absentOn404 maps 404 to null and rethrows anything else', async () => {
  const fail = (status) => Promise.reject(Object.assign(new Error('x'), { status }));
  assert.equal(await absentOn404(fail(404)), null);
  await assert.rejects(absentOn404(fail(403)), /x/);
});

test('main fills authors and DOI from CITATION.cff, else codemeta.json', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ingest-'));
  try {
    const named = (name) =>
      repo({
        name,
        full_name: `CMLPlatform/${name}`,
        html_url: `https://github.com/CMLPlatform/${name}`,
        license: { spdx_id: 'MIT' },
      });
    const files = {
      'CMLPlatform/cited/CITATION.cff': CFF,
      'CMLPlatform/cited/codemeta.json': CODEMETA, // CITATION.cff wins
      'CMLPlatform/meta/codemeta.json': CODEMETA,
    };
    const asked = [];
    await main({
      outDir: dir,
      skipFile: join(dir, 'none.txt'),
      fetchRepos: async () => [named('cited'), named('meta'), named('bare')],
      readme: async () => '',
      repoFile: async (fullName, path) => {
        asked.push(`${fullName}/${path}`);
        return files[`${fullName}/${path}`] ?? null;
      },
      log: () => {},
    });
    assert.ok(!asked.includes('CMLPlatform/cited/codemeta.json'));
    const cited = await readFile(join(dir, 'cited.md'), 'utf8');
    assert.match(cited, /authors:\n {2}- "Simon van Lierde"\n {2}- "CML Leiden"\n/);
    assert.match(cited, /^license: "MIT"$/m);
    assert.match(cited, /^doi: "10\.5281\/zenodo\.1234567"$/m);
    const meta = await readFile(join(dir, 'meta.md'), 'utf8');
    assert.match(meta, /- "Ann Bee"/);
    assert.match(meta, /^doi: "10\.5281\/zenodo\.7654321"$/m);
    const bare = await readFile(join(dir, 'bare.md'), 'utf8');
    assert.match(bare, /TODO: add author/);
    assert.doesNotMatch(bare, /^doi:/m);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('main fails when a citation file cannot be fetched', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ingest-'));
  try {
    await assert.rejects(
      main({
        outDir: dir,
        skipFile: join(dir, 'none.txt'),
        fetchRepos: async () => [repo({ html_url: 'https://github.com/CMLPlatform/other' })],
        readme: async () => '',
        repoFile: () => Promise.reject(Object.assign(new Error('GitHub 403'), { status: 403 })),
        log: () => {},
      }),
      /GitHub 403/,
    );
    assert.deepEqual(await readdir(dir), []);
  } finally {
    await rm(dir, { recursive: true });
  }
});
