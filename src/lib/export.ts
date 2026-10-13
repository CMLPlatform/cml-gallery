// The machine-readable export: /projects.json and /schema.json.

import { z } from 'astro/zod';
import { entrySchema } from './entry.ts';

type Entry = { id: string; data: z.output<typeof entrySchema> };

/**
 * One entry as a record in projects.json: its frontmatter, the absolute URL of
 * its detail page, and its repo/demo/docs/paper links. `draft` is always false
 * here and `links.image` is presentation, so both are left out.
 */
export function toRecord({ id, data }: Entry, siteBase: URL | string) {
  const { draft: _draft, links, ...fields } = data;
  const { image: _image, ...webLinks } = links;
  return { id, url: new URL(`projects/${id}/`, siteBase).href, ...fields, links: webLinks };
}

/** The frontmatter contract as JSON Schema: what an entry file may contain, before defaults. */
export const entryJsonSchema = () => z.toJSONSchema(entrySchema, { io: 'input' });
