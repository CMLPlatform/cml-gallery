# Adding a project

Your project appears on the gallery when a single Markdown file describing it
lands in `src/content/projects/`. You never touch the site's code. The whole
flow is: **copy the template, fill it in, open a pull request.**

## Step by step

1. **Copy the template.**
   Duplicate [`src/content/projects/_TEMPLATE.md`](src/content/projects/_TEMPLATE.md)
   to a new file in the same folder. Name it after your project, lowercase with
   dashes, e.g. `material-flow-explorer.md`. (Files starting with `_` are
   ignored, which is why the template never shows up on the site.)

2. **Fill in the fields.** The frontmatter (between the `---` lines) holds the
   card details; the text below the second `---` is the longer description shown
   on the project's own page.

   | Field | Required | Notes |
   |-------|----------|-------|
   | `name` | ✔ | Project title. |
   | `summary` | ✔ | One line, ≤160 characters. Shown under the title. |
   | `authors` | ✔ | A list; at least one name. |
   | `department` | ✔ | `Industrial Ecology` or `Environmental Biology`. |
   | `type` | ✔ | `software`, `data`, `model`, or `other`. |
   | `tags` | – | Keywords. They power the tag filter, so reuse existing ones where you can. |
   | `links.repo` | – | Source repository URL. |
   | `links.demo` | – | Live demo / hosted app URL. |
   | `links.docs` | – | Documentation URL. |
   | `links.paper` | – | Paste the **DOI URL** (`https://doi.org/…`). |
   | `links.image` | – | A preview image: a remote URL, or a file you add under `public/images/`. |
   | `featured` | – | `true` sorts the project to the front. Use sparingly. |

   Delete any optional field you don't need. Don't invent links or images you
   don't have.

3. **Write the description** below the second `---`, in Markdown. A short
   paragraph or two: what it does, who it's for, why it exists.

4. **Check it (optional but nice).** If you have the repo cloned:

   ```bash
   npm install
   npm run dev      # open the printed URL and find your project
   ```

   `npm run build` validates every entry against the schema: if a required
   field is missing or malformed, it fails with a message pointing at the file.

5. **Open a pull request.** Commit your new file and open a PR. A maintainer
   reviews and merges; the site rebuilds and deploys automatically.

## Adding a picture, chart, or interactive element

- **A picture or static chart** works in any entry: use standard Markdown
  (`![describe the image](/images/my-project/chart.png)`) or set `links.image`
  for the card/detail preview. Put image files under `public/images/`. Images
  are lazy-loaded automatically.

- **An interactive chart, notebook, video, or dashboard** should stay hosted
  where it's maintained (your app, an Observable notebook, YouTube…) and be
  embedded by URL. To do that, save your entry as **`.mdx`** instead of `.md`
  and use the two built-in components (no import needed): see
  [`_TEMPLATE-with-media.mdx`](src/content/projects/_TEMPLATE-with-media.mdx):

  ```mdx
  <Embed src="https://observablehq.com/embed/@you/co2" title="CO₂ flows" ratio="16/9" />

  <Figure src="/images/my-project/results.svg" alt="Bar chart of yields" caption="Fig 1. Yields." />
  ```

  `<Embed>` loads the URL in a sandboxed, lazy iframe (`title` required for
  screen readers). `<Figure>` is a captioned image (`alt` required). The site
  deliberately doesn't run custom scripts or charting libraries — that would
  make it slower and every PR harder to review — so interactive content is
  embedded from its own host, not compiled in here.

## Editing or removing a project

Editing is the same flow: change the file, open a PR. To remove a project,
delete its file. To temporarily hide one without deleting it, add `draft: true`
to its frontmatter.

## Tips

- **Reuse tags.** Before inventing a tag, glance at what existing projects use:
  shared tags make the filter far more useful.
- **Keep the summary to one line.** It's the hook on the card; the detail comes
  in the body.
- **No login, no CMS.** A file and a PR is the entire contribution mechanism, on
  purpose: it keeps the site low-maintenance and every change reviewable.
