import * as THREE from 'three';
import { base } from '$app/paths';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export type ModelPart = {
  geometry: THREE.BufferGeometry;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
};

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const storedAssetsName = 'shaderlab-assets-v1';
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
 * `path` is relative to the static directory, as written in the content files.
 * Cached geometry is shared: callers must clone it and never dispose it.
 */
export function loadModel(path: string) {
  const url = `${base}/${path.replace(/^\//, '')}`;
  return cached(models, url, async () => {
    const response = await fetchAsset(url);
    const gltf = await loader.parseAsync(await response.arrayBuffer(), '');
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

/**
 * Loads a .rawz file made by scripts/pack-raw-texture.mjs and returns it in
 * the plain .raw layout: 16-byte header, then interleaved Float16/Float32 values.
 * The returned buffer is shared and must be treated as read-only.
 */
export function loadRawFile(url: string) {
  return cached(rawFiles, url, async () => {
    const response = await fetchAsset(url);
    if (!response.body) throw new Error(`${url} has no response body`);
    const planar = new Uint8Array(await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
    if (planar.byteLength < 16) throw new Error(`${url} is missing its 16-byte header`);
    const format = new DataView(planar.buffer).getUint32(12, true);
    const bytesPerValue = format === 1 ? 2 : format === 2 ? 4 : 0;
    if (!bytesPerValue) throw new Error(`${url} has unsupported raw format ${format}`);
    return interleaveBytePlanes(planar, bytesPerValue).buffer;
  });
}

/**
 * Downloads an asset once and keeps it in Cache Storage for later visits.
 * A HEAD request compares the stored ETag/Last-Modified with the server, so a
 * changed file is downloaded again and an unchanged one never is. Offline,
 * the stored copy is used. Cache Storage only exists in secure contexts
 * (HTTPS or localhost); elsewhere every visit downloads the asset.
 */
async function fetchAsset(url: string) {
  if (!globalThis.caches) return download(url);
  const storage = await caches.open(storedAssetsName);
  const [stored, current] = await Promise.all([
    storage.match(url),
    fetch(url, { method: 'HEAD', cache: 'no-cache' }).catch(() => undefined)
  ]);
  if (stored && (!current?.ok || assetVersion(stored) === assetVersion(current))) return stored;
  const response = await download(url);
  storage.put(url, response.clone()).catch(error => console.error(`Could not store ${url} for later visits:`, error));
  return response;
}

async function download(url: string) {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`HTTP ${response.status} while loading ${url}`);
  return response;
}

function assetVersion(response: Response) {
  return response.headers.get('ETag') ?? response.headers.get('Last-Modified');
}

function interleaveBytePlanes(planar: Uint8Array, bytesPerValue: number) {
  const raw = new Uint8Array(planar.byteLength);
  raw.set(planar.subarray(0, 16));
  const valueCount = (planar.byteLength - 16) / bytesPerValue;
  for (let byte = 0; byte < bytesPerValue; byte++) {
    const plane = planar.subarray(16 + byte * valueCount, 16 + (byte + 1) * valueCount);
    for (let value = 0, target = 16 + byte; value < valueCount; value++, target += bytesPerValue) raw[target] = plane[value];
  }
  return raw;
}
