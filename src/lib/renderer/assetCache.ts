import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type ModelPart = {
  geometry: THREE.BufferGeometry;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
};

const loader = new GLTFLoader();
const models = new Map<string, Promise<ModelPart[]>>();
const rawFiles = new Map<string, Promise<ArrayBuffer>>();

function cached<T>(cache: Map<string, Promise<T>>, url: string, load: () => Promise<T>) {
  let entry = cache.get(url);
  if (!entry) {
    entry = load();
    cache.set(url, entry);
    entry.catch(() => cache.delete(url));
  }
  return entry;
}

/**
 * Every viewport on a page needs the same assets. Fetching and parsing them once
 * lets the Reference and Output viewports load concurrently from one request.
 * Cached geometry is shared: callers must clone it and never dispose it.
 */
export function loadModel(url: string) {
  return cached(models, url, async () => {
    const gltf = await loader.loadAsync(url);
    gltf.scene.updateMatrixWorld(true);
    const parts: ModelPart[] = [];
    gltf.scene.traverse(child => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const part: ModelPart = { geometry: mesh.geometry, position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), scale: new THREE.Vector3() };
      mesh.matrixWorld.decompose(part.position, part.quaternion, part.scale);
      parts.push(part);
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach(material => material.dispose());
    });
    return parts;
  });
}

/** The returned buffer is shared and must be treated as read-only. */
export function loadRawFile(url: string) {
  return cached(rawFiles, url, async () => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status} while loading ${url}`);
    return response.arrayBuffer();
  });
}
