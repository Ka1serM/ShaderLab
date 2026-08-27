import { writable } from 'svelte/store';

export const maximizedPanel = writable<string | null>(null);
