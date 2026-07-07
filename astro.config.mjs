// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

// GitHub Pages project site: served from https://<org>.github.io/<repo>, so
// `base` must be '/<repo>/'. Repo: CMLPlatform/gallery-demo.
// (For a user/org site or custom domain, set base to '/'.)
export default defineConfig({
  site: 'https://cmlplatform.github.io',
  base: '/gallery-demo/',
  integrations: [mdx()],
});
