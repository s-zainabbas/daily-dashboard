/// <reference types="vitest/config" />
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Stamp the service worker with this build's id and file list, so each release gets its own
 * offline cache and old releases' files are cleaned up instead of piling up forever.
 */
function serviceWorkerVersion(): Plugin {
  let outDir = 'dist';
  let files: string[] = [];
  return {
    name: 'sw-version',
    apply: 'build',
    configResolved(c) {
      outDir = resolve(c.root, c.build.outDir);
    },
    generateBundle(_, bundle) {
      files = Object.keys(bundle)
        .filter((f) => f.startsWith('assets/') && !/\.woff$/.test(f)) // woff2 is enough for every supported browser
        .sort();
    },
    closeBundle() {
      const path = resolve(outDir, 'sw.js');
      const build = createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 10);
      const src = readFileSync(path, 'utf8')
        .replace("'__BUILD__'", JSON.stringify(build))
        .replace('(__ASSETS__)', JSON.stringify(files.map((f) => `./${f}`)));
      writeFileSync(path, src);
    },
  };
}

// Relative base so the build works on GitHub Pages, Netlify, or opened from any sub-path.
export default defineConfig({
  base: './',
  plugins: [react(), serviceWorkerVersion()],
  test: { environment: 'jsdom' },
});
