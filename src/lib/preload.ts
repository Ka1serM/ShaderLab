import { loadTaskContent, loadTeachingContent } from '$lib/content';
import { loadModel } from '$lib/renderer/assetCache';
import type { Scene } from '$lib/renderer/Renderer';

// Route load functions call these, so SvelteKit's link preloading (hover and
// the home page's idle preload) fills the content and model caches before the
// page mounts. Failures are ignored here because the page stores and the
// viewports request the same resources again and report errors there.

export async function preloadTask(id: string) {
  const task = await loadTaskContent(id).catch(() => null);
  if (task) preloadModels(task.scenes);
}

export async function preloadTeaching(id: string) {
  const teaching = await loadTeachingContent(id).catch(() => null);
  if (teaching) preloadModels(teaching.scenes);
}

function preloadModels(scenes: Scene[] | undefined) {
  for (const scene of scenes ?? []) {
    for (const object of scene.objects) loadModel(object.source).catch(() => {});
  }
}
