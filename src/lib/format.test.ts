import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deptColor, tagColor } from './format.ts';

// NOTE: covers the pure helpers. `href` reads import.meta.env, which needs
// the Astro runtime, so it's left to `astro build` rather than a node test.

test('deptColor maps known departments, falls back for unknown', () => {
  assert.equal(deptColor('Industrial Ecology'), 'var(--dept-ie)');
  assert.equal(deptColor('Environmental Biology'), 'var(--dept-eb)');
  assert.equal(deptColor('Something Else'), 'var(--ink-soft)');
});

test('tagColor is deterministic and stays within the hue palette', () => {
  const a = tagColor('circular-economy');
  assert.equal(a, tagColor('circular-economy'));
  assert.match(a, /^var\(--ok-[a-z]+\)$/);
});
