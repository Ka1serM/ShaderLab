import * as THREE from 'three';
import { base } from '$app/paths';
import { loadRawFile } from '../assetCache';
import type { GpuTexture } from './program';

export type ShaderInput = { type: 'texture2D' | 'texture3D'; name: string; init: string };

type TextureData = { data: Float32Array | Uint16Array; half: boolean; width: number; height: number; depth: number };

function resolvePath(rawPath: string) {
  const path = rawPath.startsWith('/') ? rawPath.slice(1) : rawPath;
  return base ? `${base}/${path}` : `/${path}`;
}

async function readTexture(input: ShaderInput, path: string, signal: AbortSignal): Promise<TextureData> {
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
  if (input.type === 'texture3D') throw new Error('A texture3D is a .rawz file.');
  return { data, half: false, width, height, depth: 1 };
}

type TextureEntry = { path: string; texture: GpuTexture | null; controller: AbortController; loaded: Promise<void> };

export class ShaderInputs {
  private readonly textures = new Map<string, TextureEntry>();

  constructor(private readonly gl: WebGL2RenderingContext, private readonly restore: () => void) {}

  set(inputs: ShaderInput[]) {
    const kept = new Set<string>();
    for (const input of inputs) {
      kept.add(input.name);
      const path = resolvePath(input.init);
      if (this.textures.get(input.name)?.path === path) continue;
      this.remove(input.name);
      this.load(input, path);
    }
    for (const name of [...this.textures.keys()]) if (!kept.has(name)) this.remove(name);
  }

  texture(name: string) {
    return this.textures.get(name)?.texture ?? null;
  }

  get textureNames() {
    return [...this.textures.keys()];
  }

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

  private load(input: ShaderInput, path: string) {
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
