import { copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Vite skips dotfiles in public/, but the Apache config has to sit next to
 * index.html for cPanel to apply the HTTPS redirect and security headers.
 */
function copyHtaccess(): Plugin {
  return {
    name: 'spaf-copy-htaccess',
    apply: 'build',
    closeBundle() {
      const from = resolve(__dirname, 'public/.htaccess');
      const to = resolve(__dirname, 'dist/.htaccess');
      if (existsSync(from)) copyFileSync(from, to);
    },
  };
}

// base './' keeps the build portable: the dist folder can be dropped into any
// cPanel sub-directory and served as plain static files.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), copyHtaccess()],
  server: { port: 5173 },
  build: {
    // Source maps would expose the full readable source on a public host.
    sourcemap: false,
  },
  test: {
    // The unit tests cover the browser-side logic, so they must run in demo
    // mode whatever a developer happens to have in .env.local. Without this a
    // local VITE_API_URL sends them at a real server and they fail as
    // unauthenticated.
    env: { VITE_API_URL: '' },
  },
});
