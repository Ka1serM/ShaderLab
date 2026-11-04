import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const config = {
  preprocess: vitePreprocess(),

  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      precompress: true,
      strict: true
    })
  },

  alias: {
    '@/*': './src/lib/*'
  }
};

export default config;
