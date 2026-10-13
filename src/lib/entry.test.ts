import assert from 'node:assert/strict';
import { test } from 'node:test';
import { entrySchema } from './entry.ts';

const entry = (links: Record<string, string>) => ({
  name: 'x',
  summary: 'x',
  authors: ['A. Author'],
  department: 'Industrial Ecology',
  type: 'software',
  links,
});

test('links accept web URLs only', () => {
  assert.ok(entrySchema.safeParse(entry({ repo: 'https://github.com/CMLPlatform/relab' })).success);
  assert.ok(entrySchema.safeParse(entry({ docs: 'http://example.org' })).success);
  for (const url of ['javascript:alert(1)', 'data:text/html,x', 'ftp://example.org']) {
    assert.equal(entrySchema.safeParse(entry({ demo: url })).success, false, url);
  }
});

test('license is an SPDX id and doi a bare DOI', () => {
  const ok = { ...entry({}), license: 'CC-BY-4.0', doi: '10.5281/zenodo.1234567' };
  assert.ok(entrySchema.safeParse(ok).success);
  assert.equal(entrySchema.safeParse({ ...ok, license: 'MIT License' }).success, false);
  assert.equal(entrySchema.safeParse({ ...ok, doi: 'https://doi.org/10.5281/zenodo.1' }).success, false);
});
