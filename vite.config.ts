import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// SvelteKit's static adapter writes route HTML after VitePWA has generated
// its worker. List those documents explicitly so direct PWA launches and
// navigation are independent of a network fallback.
const offlineDocuments = [
  '/',
  '/tasks/',
  '/teach/',
  // Individual content routes are prerendered from their content indexes.
];

// VitePWA evaluates this config for more than one build phase. Keep the
// precache revision derived from source files, rather than Date.now(), so the
// prerendered HTML and client runtime share SvelteKit's build identifier.
function addSourceFiles(path: string, hash: ReturnType<typeof createHash>) {
  for (const entry of readdirSync(path).sort()) {
    const entryPath = join(path, entry);
    if (statSync(entryPath).isDirectory()) addSourceFiles(entryPath, hash);
    else hash.update(entryPath).update(readFileSync(entryPath));
  }
}

function sourceRevision(path: string) {
  const hash = createHash('sha256');
  addSourceFiles(path, hash);
  return hash.digest('hex');
}

const offlineRevision = sourceRevision('src');

export default defineConfig({
  resolve: {
    // y-monaco still imports Monaco's pre-0.56 deep path. Monaco 0.56 exposes
    // the same module through its package export map, so bridge that one import.
    alias: {
      'monaco-editor/esm/vs/editor/editor.api.js': decodeURIComponent(new URL('./node_modules/monaco-editor/esm/vs/editor/editor.api.js', import.meta.url).pathname)
    }
  },
  plugins: [
    tailwindcss(),
    sveltekit(),
    VitePWA({
      // vite-plugin-pwa derives the source worker from srcDir + filename. A
      // .ts filename is emitted as sw.js, matching app.html's registration.
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      // SvelteKit's static fallback replaces the generated HTML after Vite's
      // transform. Registration therefore lives explicitly in app.html.
      injectRegister: false,
  includeAssets: ['icons/app-icon.svg', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        id: './',
        name: 'ShaderLab',
        short_name: 'ShaderLab',
        description: 'Interaktive Lernumgebung für Computergrafik und GLSL.',
        lang: 'de',
        start_url: './',
        scope: './',
        display: 'standalone',
        theme_color: '#bf2732',
        background_color: '#e9e9e9',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }
        ]
      },
      strategies: 'injectManifest',
      injectManifest: {
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
        // Course content is part of the install snapshot. The custom worker
        // still fetches it from the network first, using this only offline.
        additionalManifestEntries: offlineDocuments.map(url => ({ url, revision: offlineRevision })),
        // Large models and volume textures are cached on first use by the
        // worker instead of delaying installation with a ~30 MB download.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,json,md,txt}']
      },
      devOptions: {
        enabled: true,
        type: 'module'
      }
    })
  ],
});
