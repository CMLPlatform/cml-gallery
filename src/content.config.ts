import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

/**
 * The "ingestion contract" for the CML project gallery.
 *
 * Every project is one Markdown file in `src/content/projects/`. This schema
 * is what a contributor's file is validated against at build time: if a field
 * is missing or malformed, the build fails with a clear message, so a bad PR
 * can't silently ship a broken card.
 *
 * Files whose name starts with `_` (e.g. `_TEMPLATE.md`) are ignored by the
 * glob loader below, so the template is never rendered as a real project.
 */

export const DEPARTMENTS = ['Industrial Ecology', 'Environmental Biology'] as const;
export const PROJECT_TYPES = ['software', 'data', 'model', 'other'] as const;

const projects = defineCollection({
  loader: glob({ pattern: '**/[^_]*.{md,mdx}', base: './src/content/projects' }),
  schema: z.object({
    // What it is
    name: z.string().min(1),
    summary: z.string().min(1).max(160, 'Keep the summary to one line (≤160 chars).'),
    // `description` is the Markdown body of the file, not a frontmatter field.

    // Who & where
    authors: z.array(z.string().min(1)).min(1, 'List at least one author.'),
    department: z.enum(DEPARTMENTS),

    // Classification (drives the filters)
    type: z.enum(PROJECT_TYPES),
    tags: z.array(z.string().min(1)).default([]),

    // Links: all optional. Paste full URLs; for a paper, paste its DOI URL
    // (https://doi.org/…). `image` may be a remote URL or a path under /public.
    links: z
      .object({
        repo: z.url().optional(),
        demo: z.url().optional(),
        docs: z.url().optional(),
        paper: z.url().optional(),
        image: z.string().optional(),
      })
      .default({}),

    // Curation
    featured: z.boolean().default(false),

    // Set true for machine-generated or work-in-progress entries. Draft entries
    // are excluded from the built site. This is the hook that a future
    // automated-ingestion step (see README) would use for its generated drafts.
    draft: z.boolean().default(false),
  }),
});

export const collections = { projects };
