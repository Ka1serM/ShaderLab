import type { PageLoad } from './$types';

export const csr = true;
export const prerender = true;

export const load: PageLoad = ({ params }) => {
  return {
    slug: params.title
  };
};
