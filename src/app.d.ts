import type { CatalogEntry } from '$lib/catalog';

declare global {
	namespace App {
		interface PageData {
			taskCatalog: CatalogEntry[];
			teachingCatalog: CatalogEntry[];
		}
	}
}

export {};
