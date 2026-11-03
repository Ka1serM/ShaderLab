import * as THREE from 'three';
import { base } from '$app/paths';
import { loadRawFile } from '../assetCache';
import type { GpuTexture, UniformValue } from './program';

const ATLAS_GRID_SIZE = 32;

/** A uniform that a task declares in its front matter. */
export type ShaderInput =
  | { type: 'float' | 'int'; name: string; init?: number }
  | { type: 'vec2' | 'vec3' | 'vec4'; name: string; init?: number[] }
  | { type: 'mat3' | 'mat4'; name: string; init?: number[][] }
  | { type: 'texture2D' | 'texture3D'; name: string; init?: string };

type TextureData = { data: Float32Array | Uint16Array; half: boolean; width: number; height: number; depth: number };

function resolvePath(rawPath: string) {
  const path = rawPath.startsWith('/') ? rawPath.slice(1) : rawPath;
  return base ? `${base}/${path}` : `/${path}`;
}

/** The value of a non-texture input. Matrices are given as columns and stored column-major. */
function initialValue(input: Exclude<ShaderInput, { type: 'texture2D' | 'texture3D' }>): UniformValue {
  if (input.type === 'float' || input.type === 'int') return typeof input.init === 'number' ? input.init : 0;
  const init = input.init as unknown;
  if (Array.isArray(init) && Array.isArray(init[0])) return (init as number[][]).flat();
  if (Array.isArray(init)) return init as number[];
  return [];
}

async function readTexture(input: Extract<ShaderInput, { type: 'texture2D' | 'texture3D' }>, path: string, signal: AbortSignal): Promise<TextureData> {
  if (path.toLowerCase().endsWith('.rawz')) {
    const buffer = await loadRawFile(path);
    if (buffer.byteLength < 16) throw new Error('Raw texture file is missing its 16-byte header');
    const view = new DataView(buffer);
    const width = view.getUint32(0, true);
    const height = view.getUint32(4, true);
    const depth = view.getUint32(8, true);
    const format = view.getUint32(12, true);
    if (!width || !height || !depth) throw new Error('Raw texture dimensions must be non-zero');
    const bytesPerValue = format === 1 ? 2 : format === 2 ? 4 : 0;
    const expectedBytes = width * height * depth * bytesPerValue;
    if (!bytesPerValue || !Number.isSafeInteger(expectedBytes) || expectedBytes > 512 * 1024 * 1024) throw new Error('Raw texture dimensions or format are invalid');
    if (buffer.byteLength !== 16 + expectedBytes) throw new Error(`Raw texture payload has ${buffer.byteLength - 16} bytes; expected ${expectedBytes}`);
    return format === 1
      ? { data: new Uint16Array(buffer, 16), half: true, width, height, depth }
      : { data: new Float32Array(buffer, 16), half: false, width, height, depth };
  }
  const loader = new THREE.ImageBitmapLoader();
  loader.setOptions({ imageOrientation: 'flipY' });
  const bitmap = await loader.loadAsync(path);
  signal.throwIfAborted();
  let data: Float32Array;
  const { width, height } = bitmap;
  try {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Failed to create 2D context for ImageBitmap');
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, width, height).data;
    data = new Float32Array(width * height);
    for (let index = 0; index < width * height; index++) data[index] = pixels[index * 4] / 255;
  } finally {
    bitmap.close();
  }
  if (input.type !== 'texture3D') return { data, half: false, width, height, depth: 1 };
  // A 3D texture can be authored as a 32 × 32 atlas of slices.
  const sliceWidth = Math.floor(width / ATLAS_GRID_SIZE);
  const sliceHeight = Math.floor(height / ATLAS_GRID_SIZE);
  const slices = new Float32Array(sliceWidth * sliceHeight * ATLAS_GRID_SIZE * ATLAS_GRID_SIZE);
  let target = 0;
  for (let tileY = 0; tileY < ATLAS_GRID_SIZE; tileY++) for (let tileX = 0; tileX < ATLAS_GRID_SIZE; tileX++) {
    for (let y = 0; y < sliceHeight; y++) {
      const start = (tileY * sliceHeight + y) * width + tileX * sliceWidth;
      slices.set(data.subarray(start, start + sliceWidth), target);
      target += sliceWidth;
    }
  }
  return { data: slices, half: false, width: sliceWidth, height: sliceHeight, depth: ATLAS_GRID_SIZE * ATLAS_GRID_SIZE };
}

type TextureEntry = { path: string; texture: GpuTexture | null; controller: AbortController; loaded: Promise<void> };

/**
 * The uniforms a task declares: plain values, and single-channel float
 * textures that load in the background. A texture that is still loading or
 * failed to load binds nothing, so the shader samples zero.
 */
export class ShaderInputs {
  readonly values = new Map<string, UniformValue>();
  private readonly textures = new Map<string, TextureEntry>();

  /** `restore` runs after a background upload changed GL state, so three.js can resynchronise. */
  constructor(private readonly gl: WebGL2RenderingContext, private readonly restore: () => void) {}

  /** Replaces every input. Textures whose path did not change are kept. */
  set(inputs: ShaderInput[]) {
    this.values.clear();
    const kept = new Set<string>();
    for (const input of inputs) {
      if (input.type !== 'texture2D' && input.type !== 'texture3D') {
        this.values.set(input.name, initialValue(input as Exclude<ShaderInput, { type: 'texture2D' | 'texture3D' }>));
        continue;
      }
      if (!input.init) continue;
      kept.add(input.name);
      const path = resolvePath(input.init);
      if (this.textures.get(input.name)?.path === path) continue;
      this.remove(input.name);
      this.load(input, path);
    }
    for (const name of [...this.textures.keys()]) if (!kept.has(name)) this.remove(name);
  }

  get names() {
    return [...this.values.keys(), ...this.textures.keys()];
  }

  texture(name: string) {
    return this.textures.get(name)?.texture ?? null;
  }

  get textureNames() {
    return [...this.textures.keys()];
  }

  /** Resolves once every texture requested so far has finished loading or failed. */
  async loaded() {
    await Promise.all([...this.textures.values()].map(entry => entry.loaded));
  }

  dispose() {
    for (const name of [...this.textures.keys()]) this.remove(name);
  }

  private remove(name: string) {
    const entry = this.textures.get(name);
    if (!entry) return;
    entry.controller.abort();
    if (entry.texture) this.gl.deleteTexture(entry.texture.handle);
    this.textures.delete(name);
  }

  private load(input: Extract<ShaderInput, { type: 'texture2D' | 'texture3D' }>, path: string) {
    const controller = new AbortController();
    const entry: TextureEntry = { path, texture: null, controller, loaded: Promise.resolve() };
    entry.loaded = readTexture(input, path, controller.signal).then(data => {
      if (controller.signal.aborted) return;
      entry.texture = this.upload(input.type === 'texture3D', data);
      this.restore();
    }, error => {
      if (!controller.signal.aborted) console.error(`Failed to load texture ${path}:`, error);
    });
    this.textures.set(input.name, entry);
  }

  private upload(volume: boolean, { data, half, width, height, depth }: TextureData): GpuTexture {
    const gl = this.gl;
    const target = volume ? gl.TEXTURE_3D : gl.TEXTURE_2D;
    const handle = gl.createTexture()!;
    // Float32 textures filter linearly only with this extension; half floats always do.
    const linear = half || Boolean(gl.getExtension('OES_texture_float_linear'));
    const internalFormat = half ? gl.R16F : gl.R32F;
    const type = half ? gl.HALF_FLOAT : gl.FLOAT;
    gl.bindTexture(target, handle);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    if (volume) gl.texImage3D(target, 0, internalFormat, width, height, depth, 0, gl.RED, type, data);
    else gl.texImage2D(target, 0, internalFormat, width, height, 0, gl.RED, type, data);
    gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, linear ? gl.LINEAR : gl.NEAREST);
    gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, linear ? gl.LINEAR : gl.NEAREST);
    gl.texParameteri(target, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(target, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (volume) gl.texParameteri(target, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.bindTexture(target, null);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    return { target, handle };
  }
}
