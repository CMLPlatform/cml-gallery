import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { entrySchema } from '../src/lib/entry.ts';
import { abstractText, doiOf, main, toEntryFields, toEntryFile } from './fetch-openalex-records.mjs';

const work = (over = {}) => ({
  id: 'https://openalex.org/W1',
  title: 'Global stocks of reclaimable copper',
  doi: 'https://doi.org/10.5281/ZENODO.1',
  type: 'dataset',
  authorships: [{ author: { display_name: 'Avery Example' } }, { author: {} }],
  abstract_inverted_index: { stocks: [1], Copper: [0] },
  ...over,
});

test('helpers', () => {
  assert.equal(abstractText({ world: [1], hello: [0] }), 'hello world');
  assert.equal(abstractText(null), '');
  assert.equal(doiOf('---\nname: x\ndoi: "10.5281/Zenodo.7"\n---\n'), '10.5281/zenodo.7');
  assert.equal(doiOf('---\nname: x\n---\n'), null);
});

test('a record becomes a schema-valid draft with a bare DOI and its type', () => {
  const f = toEntryFields(work());
  assert.equal(f.doi, '10.5281/zenodo.1');
  assert.equal(f.type, 'data');
  assert.deepEqual(f.authors, ['Avery Example']);
  assert.equal(toEntryFields(work({ type: 'software', authorships: [] })).authors[0], 'TODO: add author(s)');
  assert.match(toEntryFile(work()), /draft: true\n---\n\nCopper stocks\n$/);
  // the TODO summary keeps a draft from going live unreviewed
  assert.throws(() => entrySchema.parse({ ...toEntryFields(work()), draft: false }));
});

test('main drafts each new record once and skips known, declined and repeated ones', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oa-'));
  try {
    await writeFile(join(dir, 'listed.md'), '---\nname: Listed\ndoi: 10.5281/zenodo.2\n---\n');
    const skipFile = join(dir, 'skip.txt');
    await writeFile(skipFile, '10.5281/zenodo.3 # not a CML project\n');
    const works = async () => [
      work(),
      work({ doi: 'https://doi.org/10.5281/zenodo.2', title: 'Listed elsewhere' }),
      work({ doi: 'https://doi.org/10.5281/zenodo.3', title: 'Declined' }),
      work({ doi: 'https://doi.org/10.5281/zenodo.4' }), // a later version, same title
      work({ doi: 'https://doi.org/10.5281/zenodo.5', title: null }),
    ];
    const result = await main({ outDir: dir, skipFile, works, log: () => {} });
    assert.deepEqual(result, { written: 1, skipped: 3 });
    assert.deepEqual((await readdir(dir)).sort(), ['global-stocks-of-reclaimable-copper.md', 'listed.md', 'skip.txt']);
    assert.match(await readFile(join(dir, 'global-stocks-of-reclaimable-copper.md'), 'utf8'), /doi: "10.5281\/zenodo.1"/);
  } finally {
    await rm(dir, { recursive: true });
  }
});
