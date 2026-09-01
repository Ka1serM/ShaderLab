// nginx serves directory URLs with a trailing slash. Generate index.html
// files inside route directories so /teach/ is served instead of treated
// as a directory without an index.
export const trailingSlash = 'always';
