import assert from 'node:assert/strict';
import { test as it } from 'node:test';
import { entrySchema } from './entry.ts';

const entry = (links: Record<string, string>) => ({
  name: 'x',
  summary: 'x',
  authors: ['A. Author'],
  department: 'Industrial Ecology',
  type: 'software',
  links,
});

it('links accept web URLs only', () => {
  assert.ok(entrySchema.safeParse(entry({ repo: 'https://github.com/CMLPlatform/r9lab' })).success);
  assert.ok(entrySchema.safeParse(entry({ docs: 'http://example.org' })).success);
  for (const url of ['javascript:alert(1)', 'data:text/html,x', 'ftp://example.org']) {
    assert.equal(entrySchema.safeParse(entry({ demo: url })).success, false, url);
  }
});

it('license is an SPDX id and doi a bare DOI', () => {
  const ok = { ...entry({}), license: 'CC-BY-4.0', doi: '10.5281/zenodo.1234567' };
  assert.ok(entrySchema.safeParse(ok).success);
  assert.equal(entrySchema.safeParse({ ...ok, license: 'MIT License' }).success, false);
  assert.equal(entrySchema.safeParse({ ...ok, doi: 'https://doi.org/10.5281/zenodo.1' }).success, false);
});

it('tags are lower-case words joined by dashes', () => {
  assert.ok(entrySchema.safeParse({ ...entry({}), tags: ['open-data', 'lca2'] }).success);
  for (const tag of ['Open Data', 'a|b', 'a,b', '']) {
    assert.equal(entrySchema.safeParse({ ...entry({}), tags: [tag] }).success, false, tag);
  }
});
