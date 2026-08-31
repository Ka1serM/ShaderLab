import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import tasks from './src/lib/data/tasks.json';
import teaching from './src/lib/data/teaching.json';
import { slugify } from './src/lib/utils/slugify';

// SvelteKit's static adapter writes route HTML after VitePWA has generated
// its worker. List those documents explicitly so direct PWA launches and
// navigation are independent of a network fallback.
const offlineDocuments = [
  '/',
  '/tasks',
  '/teach',
  ...tasks.map(task => `/task/${slugify(task.title)}`),
  ...teaching.map(demo => `/teach/${demo.id}`)
];

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
      workbox: {
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
        // Every static route is explicitly precached above. A generic SPA
        // fallback points at index.html, which adapter-static adds only after
        // Workbox has generated this worker and causes a broken install.
        navigateFallback: null,
        additionalManifestEntries: offlineDocuments.map(url => ({ url, revision: String(Date.now()) })),
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,ttf,json,glb,raw}']
      },
      devOptions: {
        enabled: true,
        type: 'module'
      }
    })
  ],
});
