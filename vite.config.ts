import { defineConfig } from 'vite';

// GitHub Pages serves the built app under /word-knight/. Using a
// concrete `base` (rather than `./`) tells Vite to rewrite absolute
// `url(/assets/...)` references in bundled CSS to `url(/word-knight/assets/...)`
// during build. Dev keeps `/` so localhost URLs stay clean.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/word-knight/' : '/',
  server: {
    open: true,
  },
  build: {
    target: 'es2022',
  },
}));
