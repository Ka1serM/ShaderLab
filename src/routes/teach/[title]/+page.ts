import type { PageLoad } from './$types';

export const csr = true;
// Markdown routes are discovered in the browser from content/teaching/index.txt.
// adapter-static serves them through the app-shell fallback instead.
export const prerender = false;

export const load: PageLoad = ({ params }) => ({ title: params.title });
