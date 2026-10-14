import { error } from '@sveltejs/kit';
import type { EntryGenerator, PageServerLoad } from './$types';
import { tasks } from '$lib/server/content';

export const entries: EntryGenerator = () => [...tasks.keys()].map(title => ({ title }));

export const load: PageServerLoad = ({ params }) => {
  const task = tasks.get(params.title);
  if (!task) error(404, 'This task could not be found.');
  return { slug: params.title, task };
};
