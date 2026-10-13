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
