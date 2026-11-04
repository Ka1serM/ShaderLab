import { loadModel } from '$lib/renderer/assetCache';
import type { Scene } from '$lib/renderer/Renderer';

export function preloadModels(scenes: Scene[]) {
  for (const scene of scenes) {
    for (const object of scene.objects) loadModel(object.source).catch(() => {});
  }
}
