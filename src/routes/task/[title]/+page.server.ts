import tasks from '$lib/data/tasks.json';
import type { PageServerLoad, EntryGenerator } from './$types';
import { slugify } from '$lib/utils/slugify';
import { error } from '@sveltejs/kit';

export const prerender = true;

// Pre-render all dynamic routes using slugs
export const entries: EntryGenerator = () => {
  return tasks.map((task) => ({
    title: slugify(task.title)
  }));
};

// Load task data by slug
export const load: PageServerLoad = ({ params }) => {
  const slug = params.title; // Already decoded by SvelteKit
  const task = tasks.find((t) => slugify(t.title) === slug);

  if (!task) {
    throw error(404, {
      message: `Task not found: "${slug}"`
    });
  }

  return { task };
};