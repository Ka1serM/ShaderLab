// The whole site is static: every page is prerendered at build time.
export const prerender = true;
// nginx serves directory URLs with a trailing slash. Generate index.html
// files inside route directories so /teach/ is served instead of treated
// as a directory without an index.
export const trailingSlash = 'always';
