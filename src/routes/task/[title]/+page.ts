import type { PageLoad } from './$types';
import { slugify } from '$lib/utils/slugify';
import taskIndex from '../../../../static/content/tasks/index.txt?raw';

export const csr = true;
export const prerender = true;

export function entries() {
  return taskIndex.split(/\r?\n/)
    .map(name => name.trim())
    .filter(name => name && !name.startsWith('#'))
    .map(name => ({ title: slugify(name.replace(/\.md$/i, '')) }));
}

export const load: PageLoad = ({ params }) => {
  return {
    slug: params.title
  };
};
