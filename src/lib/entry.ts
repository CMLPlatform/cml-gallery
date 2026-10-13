import { z } from 'astro/zod';

/**
 * The "ingestion contract" for the CML project gallery: the shape of one
 * project entry's frontmatter.
 *
 * It lives here, free of `astro:` imports, so both the site
 * (`src/content.config.ts`) and the ingest script
 * (`scripts/fetch-github-projects.mjs`) validate against the same schema.
 */

export const DEPARTMENTS = ['Industrial Ecology', 'Environmental Biology'] as const;
export const PROJECT_TYPES = ['software', 'data', 'model', 'other'] as const;
export const SUMMARY_MAX = 160;

export type Department = (typeof DEPARTMENTS)[number];

// Links render as clickable hrefs, so only web URLs: `javascript:` and `data:` would pass z.url().
const webUrl = z.url({ protocol: /^https?$/ });

// The ingest script fills unknown fields with "TODO …"; a published entry must not keep one.
const TODO = /^\s*TODO\b/i;

// An SPDX licence id such as `MIT` or `CC-BY-4.0`, and a bare DOI such as `10.5281/zenodo.1234567`.
const SPDX_ID = /^[A-Za-z0-9.+-]+$/;
const DOI = /^10\.\d{4,9}\/\S+$/;

export const entrySchema = z
  .object({
    // What it is
    name: z.string().min(1),
    summary: z
      .string()
      .min(1)
      .max(SUMMARY_MAX, `Keep the summary to one line (≤${SUMMARY_MAX} chars).`),
    // `description` is the Markdown body of the file, not a frontmatter field.

    // Who & where
    authors: z.array(z.string().min(1)).min(1, 'List at least one author.'),
    department: z.enum(DEPARTMENTS),

    // Classification (drives the filters)
    type: z.enum(PROJECT_TYPES),
    tags: z.array(z.string().min(1)).default([]),

    // Licence and identifier, both optional. `doi` is the project's own DOI, without
    // https://doi.org/: for software or data on Zenodo, the concept DOI that covers
    // every version. A paper written about the project goes in `links.paper`.
    license: z.string().regex(SPDX_ID, 'Use an SPDX licence id, e.g. `MIT` or `CC-BY-4.0`.').optional(),
    doi: z.string().regex(DOI, 'Write the DOI bare, e.g. `10.5281/zenodo.1234567`.').optional(),

    // Links: all optional. Paste full URLs; for a paper about the project, paste
    // its DOI URL (https://doi.org/…). `image` may be a remote URL or a path under /public.
    links: z
      .object({
        repo: webUrl.optional(),
        demo: webUrl.optional(),
        docs: webUrl.optional(),
        paper: webUrl.optional(),
        image: z.string().optional(),
      })
      .default({}),

    // Curation
    featured: z.boolean().default(false),

    // Set true for machine-generated or work-in-progress entries. Draft entries
    // are excluded from the built site; the ingest script writes its drafts
    // with this flag.
    draft: z.boolean().default(false),
  })
  .superRefine((entry, ctx) => {
    if (entry.draft) return;
    for (const [field, values] of Object.entries({
      name: [entry.name],
      summary: [entry.summary],
      authors: entry.authors,
      tags: entry.tags,
    })) {
      if (values.some((v) => TODO.test(v))) {
        ctx.addIssue({
          code: 'custom',
          path: [field],
          message: `Replace the TODO placeholder in \`${field}\` before removing \`draft: true\`.`,
        });
      }
    }
  });
