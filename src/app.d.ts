// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { CatalogEntry } from '$lib/catalog';

declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		interface PageData {
			taskCatalog: CatalogEntry[];
			teachingCatalog: CatalogEntry[];
		}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
