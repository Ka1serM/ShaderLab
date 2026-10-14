import { browser } from '$app/environment';
import type { PageLoad } from './$types';
import { preloadModels } from '$lib/preload';

export const load: PageLoad = ({ data }) => {
  if (browser) preloadModels(data.definition.scenes);
  return data;
};
