import type { PageServerLoad } from './$types';
import { taskCatalog, taskSearchText } from '$lib/server/content';

export const load: PageServerLoad = () => ({
  searchText: Object.fromEntries(taskCatalog.map(entry => [entry.id, taskSearchText(entry.id)]))
});
