import type { PageLoad } from './$types';

export const csr = true;
export const ssr = false;
export const prerender = false;

export const load: PageLoad = ({ params }) => ({ title: params.title });
