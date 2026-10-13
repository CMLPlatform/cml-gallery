import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { entrySchema } from './lib/entry.ts';

/**
 * Every project is one Markdown file in `src/content/projects/`, validated at
 * build time against the schema in `src/lib/entry.ts`: if a field is missing
 * or malformed, the build fails with a clear message, so a bad PR can't
 * silently ship a broken card.
 *
 * Files whose name starts with `_` (e.g. `_TEMPLATE.md`) are ignored by the
 * glob loader below, so the template is never rendered as a real project.
 */

const projects = defineCollection({
  loader: glob({ pattern: '**/[^_]*.{md,mdx}', base: './src/content/projects' }),
  schema: entrySchema,
});

export const collections = { projects };
