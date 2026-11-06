/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the build works on GitHub Pages, Netlify, or opened from any sub-path.
export default defineConfig({
  base: './',
  plugins: [react()],
  test: { environment: 'jsdom' },
});
