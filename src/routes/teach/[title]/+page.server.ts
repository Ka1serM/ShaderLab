import { error } from '@sveltejs/kit';
import type { EntryGenerator, PageServerLoad } from './$types';
import { teachings } from '$lib/server/content';

export const entries: EntryGenerator = () => [...teachings.keys()].map(title => ({ title }));

export const load: PageServerLoad = ({ params }) => {
  const definition = teachings.get(params.title);
  if (!definition) error(404, 'This teaching demo could not be found.');
  return { title: params.title, definition };
};
