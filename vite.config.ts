import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

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
    sveltekit()
  ],
});
