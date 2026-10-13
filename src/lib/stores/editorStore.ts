import { browser } from '$app/environment';
import { writable } from 'svelte/store';

export const DEFAULT_EDITOR_FONT_SIZE = 14;
const MIN_EDITOR_FONT_SIZE = 8;
const MAX_EDITOR_FONT_SIZE = 32;
const STORAGE_KEY = 'shaderlab:editor-font-size';

function clampFontSize(size: number) {
  return Math.min(MAX_EDITOR_FONT_SIZE, Math.max(MIN_EDITOR_FONT_SIZE, Math.round(size)));
}

function loadFontSize() {
  if (!browser) return DEFAULT_EDITOR_FONT_SIZE;
  try {
    const stored = Number(localStorage.getItem(STORAGE_KEY));
    return stored > 0 ? clampFontSize(stored) : DEFAULT_EDITOR_FONT_SIZE;
  } catch {
    return DEFAULT_EDITOR_FONT_SIZE;
  }
}

const fontSize = writable(loadFontSize());

export const editorFontSize = {
  subscribe: fontSize.subscribe,
  set(size: number) {
    const clamped = clampFontSize(size);
    fontSize.set(clamped);
    try {
      localStorage.setItem(STORAGE_KEY, String(clamped));
    } catch {
      // Storage can be disabled or full; the size still applies for this session.
    }
  }
};
