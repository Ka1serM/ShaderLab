import type { LayoutServerLoad } from './$types';
import { taskCatalog, teachingCatalog } from '$lib/server/content';

export const load: LayoutServerLoad = () => ({ taskCatalog, teachingCatalog });
