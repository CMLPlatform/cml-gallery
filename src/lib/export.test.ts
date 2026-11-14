import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEPARTMENTS, entrySchema } from './entry.ts';
import { entryJsonSchema, toRecord } from './export.ts';

const data = entrySchema.parse({
  name: 'R9lab',
  summary: 'Disassembly data.',
  authors: ['Simon van Lierde'],
  department: 'Industrial Ecology',
  type: 'software',
  links: { repo: 'https://github.com/CMLPlatform/r9lab', image: '/images/r9lab.png' },
});

test('a record carries the frontmatter, the detail URL and the web links', () => {
  assert.deepEqual(toRecord({ id: 'r9lab', data }, 'https://cmlplatform.github.io/cml-gallery/'), {
    id: 'r9lab',
    url: 'https://cmlplatform.github.io/cml-gallery/projects/r9lab/',
    name: 'R9lab',
    summary: 'Disassembly data.',
    authors: ['Simon van Lierde'],
    department: 'Industrial Ecology',
    type: 'software',
    tags: [],
    featured: false,
    links: { repo: 'https://github.com/CMLPlatform/r9lab' },
  });
});

test('the JSON Schema describes the input: defaulted fields are optional', () => {
  const schema = entryJsonSchema();
  assert.deepEqual(schema.required, ['name', 'summary', 'authors', 'department', 'type']);
  assert.deepEqual(schema.properties?.department, { type: 'string', enum: [...DEPARTMENTS] });
});
