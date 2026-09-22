import type { PageLoad } from './$types';
import { slugify } from '$lib/utils/slugify';
import teachingIndex from '../../../../static/content/teaching/index.txt?raw';

export const csr = true;
export const prerender = true;

export function entries() {
  return teachingIndex.split(/\r?\n/)
    .map(name => name.trim())
    .filter(name => name && !name.startsWith('#'))
    .map(name => ({ title: slugify(name.replace(/\.md$/i, '')) }));
}

export const load: PageLoad = ({ params }) => ({ title: params.title });
