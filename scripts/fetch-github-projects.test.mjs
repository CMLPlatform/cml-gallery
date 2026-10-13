import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { entrySchema } from '../src/lib/entry.ts';
import {
  main,
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
