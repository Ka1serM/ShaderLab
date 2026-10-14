import { loadModel } from '$lib/renderer/assetCache';
import type { Scene } from '$lib/renderer/Renderer';

/**
 * Route load functions call this, so SvelteKit's link preloading (hover and the
 * home page's idle preload) starts the model downloads before the page mounts.
 * Failures are ignored here: the viewport loads the same models and reports them.
 */
export function preloadModels(scenes: Scene[]) {
  for (const scene of scenes) {
    for (const object of scene.objects) loadModel(object.source).catch(() => {});
  }
}
