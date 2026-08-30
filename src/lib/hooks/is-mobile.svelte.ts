import { MediaQuery } from "svelte/reactivity";
import { browser } from "$app/environment";
import { readable } from "svelte/store";

const DEFAULT_MOBILE_BREAKPOINT = 1024;

export class IsMobile extends MediaQuery {
	constructor(breakpoint: number = DEFAULT_MOBILE_BREAKPOINT) {
		super(`max-width: ${breakpoint - 1}px`);
	}
}

/**
 * A browser-backed media-query store for layout branches. `change` fires in
 * both directions and the current match is read immediately on subscription.
 */
export function createMediaQuery(query: string, fallback = false) {
	return readable(fallback, (set) => {
		if (!browser) return;
		const mediaQuery = window.matchMedia(query);
		const update = () => set(mediaQuery.matches);
		update();
		mediaQuery.addEventListener('change', update);
		return () => mediaQuery.removeEventListener('change', update);
	});
}

export const isMobile = createMediaQuery(`(max-width: ${DEFAULT_MOBILE_BREAKPOINT - 1}px)`);
