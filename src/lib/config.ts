import { browser } from '$app/environment';

const STORAGE_VERSION = 1;
const VERSION_KEY = 'shaderlab:version';

export function checkStorageVersion() {
  if (!browser) return;
  try {
    const stored = Number(localStorage.getItem(VERSION_KEY));
    if (stored !== STORAGE_VERSION) {
      localStorage.clear();
      localStorage.setItem(VERSION_KEY, String(STORAGE_VERSION));
    }
  } catch {}
}
