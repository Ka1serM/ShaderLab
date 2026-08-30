import { browser } from '$app/environment';

const STORAGE_VERSION = 1;
const VERSION_KEY = 'shaderlab:version';

export function checkStorageVersion() {
  if (!browser) return;
  try {
    const stored = Number(localStorage.getItem(VERSION_KEY));
    if (stored !== STORAGE_VERSION) {
	  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
		const key = localStorage.key(index);
		if (key?.startsWith('shaderlab:')) localStorage.removeItem(key);
	  }
      localStorage.setItem(VERSION_KEY, String(STORAGE_VERSION));
    }
  } catch {}
}
