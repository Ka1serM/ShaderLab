import type { PageServerLoad } from './$types';
import { teachingCatalog, teachingSearchText } from '$lib/server/content';

export const load: PageServerLoad = () => ({
  searchText: Object.fromEntries(teachingCatalog.map(entry => [entry.id, teachingSearchText(entry.id)]))
});
