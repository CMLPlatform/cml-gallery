import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Filters, filterQuery, matches, readFilters } from './filter.ts';

const card = {
  search: 'r9lab disassembly data simon van lierde open-data',
  department: 'Industrial Ecology',
  type: 'software',
  tags: ['open-data', 'circular-economy'],
};
const none: Filters = { q: '', dept: '', type: '', tags: [] };

test('matches applies every set filter, and any one tag', () => {
  assert.ok(matches(card, none));
  assert.ok(matches(card, { ...none, q: '  Disassembly ' }));
  assert.equal(matches(card, { ...none, q: 'atlas' }), false);
  assert.ok(matches(card, { ...none, dept: 'Industrial Ecology', type: 'software' }));
  assert.equal(matches(card, { ...none, dept: 'Environmental Biology' }), false);
  assert.equal(matches(card, { ...none, type: 'data' }), false);
  assert.ok(matches(card, { ...none, tags: ['biodiversity', 'open-data'] }));
  assert.equal(matches(card, { ...none, tags: ['biodiversity'] }), false);
});

test('filters round-trip through the query string', () => {
  const filters = { q: 'flow', dept: 'Industrial Ecology', type: 'data', tags: ['a', 'open-data'] };
  const query = filterQuery(filters);
  // biome-ignore lint/security/noSecrets: a query string, not a secret
  assert.equal(query, '?q=flow&dept=Industrial+Ecology&type=data&tags=a,open-data');
  assert.deepEqual(readFilters(query), filters);
  assert.equal(filterQuery(none), '');
  assert.deepEqual(readFilters(''), none);
  // biome-ignore lint/security/noSecrets: a query string, not a secret
  assert.deepEqual(readFilters('?q=a%2Cb&tags=x%2Cy'), { ...none, q: 'a,b', tags: ['x', 'y'] });
});

test('filterQuery keeps parameters that are not filters', () => {
  // biome-ignore lint/security/noSecrets: a query string, not a secret
  const keep = '?utm_source=x&type=model&tags=a';
  // biome-ignore lint/security/noSecrets: a query string, not a secret
  const want = '?utm_source=x&type=data';
  assert.equal(filterQuery({ q: '', dept: '', type: 'data', tags: [] }, keep), want);
});
