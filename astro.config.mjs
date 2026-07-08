// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

// GitHub Pages project site: served from https://<org>.github.io/<repo>, so
// `base` must be '/<repo>/'. Repo: CMLPlatform/cml-gallery.
// (For a user/org site or custom domain, set base to '/'.)
export default defineConfig({
  site: 'https://cmlplatform.github.io',
  base: '/cml-gallery/',
  integrations: [mdx()],
});
