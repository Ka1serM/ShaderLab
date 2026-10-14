import type { PageLoad } from './$types';
import { browser } from '$app/environment';
import { slugify } from '$lib/utils/slugify';
import { preloadTeaching } from '$lib/preload';
import teachingIndex from '../../../../static/content/teaching/index.txt?raw';

export const csr = true;
export const prerender = true;

export function entries() {
  return teachingIndex.split(/\r?\n/)
    .map(name => name.trim())
    .filter(name => name && !name.startsWith('#'))
    .map(name => ({ title: slugify(name.replace(/\.md$/i, '')) }));
}

export const load: PageLoad = async ({ params }) => {
  if (browser) await preloadTeaching(params.title);
  return { title: params.title };
};
