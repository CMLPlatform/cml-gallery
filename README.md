# CML Project Gallery

A prototype public gallery for the software, data, and models built at the
**Institute of Environmental Sciences (CML)**, Leiden University, so colleagues
can showcase their work in one place.

> **Status: proposal-stage prototype.** Built to demonstrate an approach for
> discussion with the institute. It is **not an official CML site**, and the two
> sample projects are clearly marked placeholders.

## The idea

Contribution should be as cheap as possible. Adding a project is **one templated
Markdown file and a pull request:** no CMS, no login, no touching the site's
code. The site stays low-maintenance, and every change goes through normal Git
review.

The file *is* the contract: each entry is validated at build time against a typed
schema ([`src/content.config.ts`](src/content.config.ts)), so a malformed entry
fails the build with a clear message instead of shipping a broken card.

## Add a project

See **[CONTRIBUTING.md](CONTRIBUTING.md)**. In short: copy
[`_TEMPLATE.md`](src/content/projects/_TEMPLATE.md), fill it in, open a PR.

## What's here

| Path | What it is |
| ---- | ---------- |
| `src/content.config.ts` | The Zod schema: the ingestion contract. |
| `src/content/projects/` | One Markdown file per project. `_TEMPLATE.md` is the template. |
| `src/pages/index.astro` | Landing page: searchable, filterable card grid. |
| `src/pages/projects/[slug].astro` | Per-project detail page. |
| `src/components/`, `src/scripts/filter.js` | Cards, filter bar, and the vanilla-JS filtering. |
| `.github/workflows/deploy.yml` | Build & deploy to GitHub Pages. |

### Design notes

- **Astro static site**, typed content collections, **zero client framework**.
  Filtering and search are plain DOM (`src/scripts/filter.js`) over the
  server-rendered grid, so the gallery still works with JavaScript disabled.
- **Accessible by default:** semantic HTML, labelled and keyboard-navigable
  filters, visible focus, WCAG-AA contrast, and colourblind-safe (Okabe-Ito)
  category colours that are always paired with text.
- **Fonts are self-hosted** (`@fontsource`), so the site makes no third-party
  requests, relevant for an EU institute.
- Images are lazy-loaded.

## Run locally

```bash
npm install
npm run dev        # local dev server with hot reload
npm run build      # production build to dist/ (also validates every entry)
npm run preview    # preview the production build
```

Requires Node 18+.

## Deploy

A GitHub Actions workflow ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)) builds and publishes to **GitHub Pages** on every push to `main`.

**Before the first deploy**, set the URL in
[`astro.config.mjs`](astro.config.mjs):

- Project site (`https://<org>.github.io/<repo>`): set `site` and
  `base: '/<repo>/'`.
- User/org site or custom domain: set `base: '/'`.

Then, in the repository settings, set **Pages → Build and deployment → Source**
to **GitHub Actions**.

To deploy to Cloudflare Pages instead, use build command `npm run build` and
output directory `dist/`; no Cloudflare config is included here.

## Optional: automated ingestion

Hand-authored entries are the primary path. As an **optional** supplement, a
build-time script can surface repositories automatically:

```bash
npm run ingest                                   # write new drafts
node scripts/fetch-github-projects.mjs --dry-run # preview without writing
```

[`scripts/fetch-github-projects.mjs`](scripts/fetch-github-projects.mjs) fetches
public repositories in the `CMLPlatform` org that carry the **`cml-showcase`**
topic and writes one draft entry per repo, derived from its description,
homepage, topics, and README excerpt.

Two safeguards:

- Every generated entry is written with **`draft: true`**, so it's **excluded
  from the built site** until a maintainer reviews it, fills in the TODO fields
  (`department`, `authors`), and removes the flag.
- **Existing files are never overwritten:** a repo is skipped if
  `<repo-name>.md` already exists. This is also why a promoted draft should
  keep its filename — rename it, and the next run re-drafts that repo. The
  duplicate arrives as a `draft` for review, so no harm done, but it's noise.

[`.github/workflows/ingest.yml`](.github/workflows/ingest.yml) runs this weekly
(and on demand) and opens a pull request with any new drafts, so review happens
through the same PR flow as everything else. Delete that workflow for
hand-curation only.

## Context

This prototype is meant to start a conversation about shared research
infrastructure at CML. It overlaps with an AI4IE web-apps showcase, which could
later reuse the same template-and-PR ingestion approach.
