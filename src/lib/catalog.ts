import { browser } from '$app/environment';
import { readable } from 'svelte/store';
import type { Task } from '$lib/stores/taskStore';
import type { Teach } from '$lib/stores/teachingStore';

// The navigation shows the catalog on every page. Importing the content parser
// (KaTeX, marked, js-yaml) lazily keeps it out of the layout's startup bundle.

/** `null` until the catalog has loaded, so pages can tell loading from empty. */
export const taskCatalog = readable<Task[] | null>(null, set => {
  if (!browser) return;
  import('$lib/content').then(content => content.loadTaskCatalog()).then(set).catch(error => console.error('Failed to load task catalog:', error));
});

export const teachingCatalog = readable<Teach[] | null>(null, set => {
  if (!browser) return;
  import('$lib/content').then(content => content.loadTeachingCatalog()).then(set).catch(error => console.error('Failed to load teaching catalog:', error));
});
