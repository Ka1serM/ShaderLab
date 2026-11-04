import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  resolve: {
    alias: {
      'monaco-editor/esm/vs/editor/editor.api.js': decodeURIComponent(new URL('./node_modules/monaco-editor/esm/vs/editor/editor.api.js', import.meta.url).pathname)
    }
  },
  plugins: [
    tailwindcss(),
    sveltekit()
  ],
});
