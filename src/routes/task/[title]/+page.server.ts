import tasks from '$lib/data/tasks.json';
import type { PageLoad, EntryGenerator } from './$types';

export const prerender = true;

// Pre-render all dynamic routes
export const entries: EntryGenerator = () => {
  return tasks.map((task) => ({
    title: task.title
  }));
};

// Load the task data
export const load: PageLoad = ({ params }: { params: { title: string } }) => {
  const task = tasks.find(
    (t) =>
      t.title.trim().toLowerCase() ===
      decodeURIComponent(params.title).trim().toLowerCase()
  );

  if (!task) throw new Error(`Task "${params.title}" not found`);

  return { task };
};
