import * as THREE from 'three';
import { base } from '$app/paths';

const ATLAS_GRID_SIZE = 32;

export type ShaderInput =
  | { type: 'float' | 'int'; name: string; init?: number }
  | { type: 'vec2' | 'vec3' | 'vec4'; name: string; init?: number[] }
  | { type: 'mat3' | 'mat4'; name: string; init?: number[][] }
  | { type: 'texture2D' | 'texture3D'; name: string; init?: string };

export class ShaderTaskMaterial extends THREE.RawShaderMaterial {
  vertexShader: string;
  fragmentShader: string;
  needsUpdate: boolean;
  inputsMap: Record<
    string,
    {
      value:
        | number
        | number[]
        | number[][]
        | THREE.Vector2
        | THREE.Vector3
        | THREE.Vector4
        | THREE.Matrix3
        | THREE.Matrix4
        | THREE.Texture
        | null;
      type: ShaderInput['type'];
      initPath?: string; // Store the path to prevent re-loads
    }
  > = {};

  // Track pending loads to prevent race conditions
  private pendingTextureLoads: Map<string, Promise<void>> = new Map();

  constructor(params: { vertexShader: string; fragmentShader: string; inputs?: ShaderInput[] }) {
    super({
      vertexShader: params.vertexShader,
      fragmentShader: params.fragmentShader,
      uniforms: {}, // This correctly initializes the *inherited* `this.uniforms`
      glslVersion: THREE.GLSL3
    });

    this.vertexShader = params.vertexShader;
    this.fragmentShader = params.fragmentShader;
    // `this.uniforms` is now correctly initialized to {} by the `super()` call.
    this.needsUpdate = true;

    if (params.inputs) {
      for (const input of params.inputs) this.addInput(input);
    }
  }

  /** Add or update a shader input */
  addInput(input: ShaderInput) {
    let value: any;
    let initPath: string | undefined;
    const existingEntry = this.inputsMap[input.name];

    switch (input.type) {
      case 'float':
      case 'int':
        value = typeof input.init === 'number' ? input.init : 0;
        break;

      case 'vec2':
      case 'vec3':
      case 'vec4':
      case 'mat3':
      case 'mat4':
        value = this.initStructuredInput(input);
        break;

      case 'texture2D':
      case 'texture3D':
        value = null; // Default to null until loaded
        if (input.init) {
          initPath = this.resolvePath(input.init);

          // "Don't load twice" logic:
          // Check if same input name + same path is already set.
          if (existingEntry && existingEntry.initPath === initPath) {
            // If it's already loading (value=null) or loaded (value=Texture),
            // we don't need to do anything.
            return;
          }

          // New input or new path, trigger the load
          this.loadTexture(input, initPath);
        }
        break;
    }

    if (existingEntry) {
      // Input already exists, just update its properties
      existingEntry.value = value;
      existingEntry.type = input.type;
      existingEntry.initPath = initPath;
      this.uniforms[input.name].value = value; // Update the uniform's value
    } else {
      // This is a new input
      this.inputsMap[input.name] = { value, type: input.type, initPath };
      this.uniforms[input.name] = { value }; // Create the new uniform entry
    }
  }

  /** Initialize arrays or single vectors/matrices */
  private initStructuredInput(input: ShaderInput) {
    const { type, init } = input;
    let arr: any;
    if (init === undefined || typeof init === 'number') arr = [init ?? 0];
    else arr = init;
    if (!Array.isArray(arr[0])) return this.createStructuredValue(type, arr as number[]);
    return (arr as number[][]).map((v) => this.createStructuredValue(type, v));
  }

  private createStructuredValue(
    type: ShaderInput['type'],
    arr: number[]
  ):
    | THREE.Vector2
    | THREE.Vector3
    | THREE.Vector4
    | THREE.Matrix3
    | THREE.Matrix4
    | number {
    switch (type) {
      case 'vec2':
        return new THREE.Vector2(...arr);
      case 'vec3':
        return new THREE.Vector3(...arr);
      case 'vec4':
        return new THREE.Vector4(...arr);
      case 'mat3':
        return new THREE.Matrix3().fromArray(arr);
      case 'mat4':
        return new THREE.Matrix4().fromArray(arr);
      default:
        return arr[0] ?? 0;
    }
  }

  private resolvePath(rawPath: string): string {
    if (!rawPath) return rawPath;
    // SvelteKit 'static' folder is served from root.
    // `base` is prepended if the app is not at root.
    const p = rawPath.startsWith('/') ? rawPath.slice(1) : rawPath;
    return base ? `${base}/${p}` : `/${p}`;
  }

  /** Load texture input (async) */
  private loadTexture(
    input: Extract<ShaderInput, { type: 'texture2D' | 'texture3D' }>,
    resolvedPath: string
  ) {
    const name = input.name;

    // Check if a load for this *uniform name* is already in progress
    if (this.pendingTextureLoads.has(name)) {
      console.warn(`Texture load for "${name}" already in progress. Ignoring new request.`);
      return;
    }

    const loadPromise = (async () => {
      const path = resolvedPath;
      try {
        let arrayData: Float32Array | Uint16Array;
        let width = 0,
          height = 0,
          depth = 1;
        let dataType: THREE.TextureDataType = THREE.FloatType;

        if (path.toLowerCase().endsWith('.raw')) {
          // Raw file: fetch and parse
          const buffer = await fetch(path).then((res) => res.arrayBuffer());
          const view = new DataView(buffer);
          width = view.getUint32(0, true);
          height = view.getUint32(4, true);
          depth = view.getUint32(8, true);
          const format = view.getUint32(12, true);
          const parsed = this.parseRawData(buffer, format);
          arrayData = parsed.data;
          dataType = parsed.dataType;
        } else {
          // Image file: load as ImageBitmap
          const loader = new THREE.ImageBitmapLoader();
          loader.setOptions({ imageOrientation: 'flipY' });
          const bitmap = await loader.loadAsync(path);
          width = bitmap.width;
          height = bitmap.height;
          arrayData = this.bitmapToFloatArray(bitmap);
          depth = 1; // Default depth for a 2D image

          // --- 3D Atlas Reordering Logic ---
          if (input.type === 'texture3D') {
            const { reorderedData, w3d, h3d, d3d } = this.reorder3DDataFrom2DAtlas(
              arrayData as Float32Array,
              width,
              height
            );
            arrayData = reorderedData;
            width = w3d;
            height = h3d;
            depth = d3d;
          }
          // --- End 3D Atlas Reordering Logic ---

          dataType = THREE.FloatType;
        }

        // Create texture depending on input type
        const tex =
          input.type === 'texture3D'
            ? new THREE.Data3DTexture(arrayData, width, height, depth) // Now uses calculated W, H, D
            : new THREE.DataTexture(arrayData.slice(0, width * height), width, height);

        tex.format = THREE.RedFormat;
        tex.type = dataType;
        tex.colorSpace = THREE.NoColorSpace;
        tex.minFilter = tex.magFilter = THREE.LinearFilter;
        tex.magFilter = tex.magFilter = THREE.LinearFilter;
        tex.unpackAlignment = 1;
        tex.needsUpdate = true;

        // This is the CRITICAL part.
        // `this.uniforms` now refers to the *correct* object.
        this.inputsMap[name].value = tex;
        this.uniforms[name].value = tex;
      } catch (err) {
        console.error(`Failed to load texture ${path}:`, err);
        // Ensure uniform is null on failure
        if (this.inputsMap[name]) this.inputsMap[name].value = null;
        if (this.uniforms[name]) this.uniforms[name].value = null;
      } finally {
        // Whether success or fail, remove from pending map
        this.pendingTextureLoads.delete(name);
      }
    })();

    // Store the promise in the map
    this.pendingTextureLoads.set(name, loadPromise);
  }

  /**
   * Reorders a 2D atlas image (W x H) into a 3D volume (W_slice x H_slice x D).
   * Assumes slices are laid out in a 32x32 grid.
   */
  private reorder3DDataFrom2DAtlas(
    sourceArray: Float32Array,
    atlasWidth: number,
    atlasHeight: number
  ): { reorderedData: Float32Array; w3d: number; h3d: number; d3d: number } {
    const grid = ATLAS_GRID_SIZE; // 32
    const totalSlices = grid * grid; // 1024

    // Calculate dimensions of a single slice (volume W and H)
    // We use Math.floor() since the user's W/H (3496) is not perfectly divisible by 32 (3496/32 = 109.25)
    // This is the safest way to prevent array indexing errors, though it may crop a few pixels.
    const sliceW = Math.floor(atlasWidth / grid);
    const sliceH = Math.floor(atlasHeight / grid);
    const sliceSize = sliceW * sliceH;
    
    // Allocate the new array for the 3D volume
    const targetArray = new Float32Array(sliceSize * totalSlices);
    
    let targetIndex = 0;

    for (let tileY = 0; tileY < grid; tileY++) {
      for (let tileX = 0; tileX < grid; tileX++) {
        // Calculate the starting pixel coordinates in the 2D atlas for this tile
        const startX = tileX * sliceW;
        const startY = tileY * sliceH;

        // The current tile index is the Z-slice index in the final 3D texture.
        // It's organized column-by-column: slice 0, slice 1, ..., slice 31 on row 0, then slice 32 on row 1, etc.
        
        // Loop through the pixels of the current slice
        for (let y = 0; y < sliceH; y++) {
          // Calculate the starting index of the row in the 2D atlas
          const rowStartIndex = (startY + y) * atlasWidth + startX;

          // Copy the entire row of pixels from the source to the target
          const sourceRow = sourceArray.subarray(
            rowStartIndex,
            rowStartIndex + sliceW
          );

          // Copy the row into the 3D target array
          targetArray.set(sourceRow, targetIndex);
          targetIndex += sliceW;
        }
      }
    }

    console.log(`Reordered 2D Atlas into 3D Texture: ${sliceW}x${sliceH}x${totalSlices}`);
    
    return {
      reorderedData: targetArray,
      w3d: sliceW,
      h3d: sliceH,
      d3d: totalSlices
    };
  }

  /** Convert ImageBitmap to Float32Array (red channel only) */
  private bitmapToFloatArray(bitmap: ImageBitmap): Float32Array {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to create 2D context for ImageBitmap');
    ctx.drawImage(bitmap, 0, 0);
    const imgData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    const arr = new Float32Array(bitmap.width * bitmap.height);
    for (let i = 0; i < bitmap.width * bitmap.height; i++) {
      arr[i] = imgData.data[i * 4] / 255;
    }
    return arr;
  }

  private parseRawData(
    buffer: ArrayBuffer,
    format: number
  ): { data: Float32Array | Uint16Array; dataType: THREE.TextureDataType } {
    if (format === 1)
      return { data: new Uint16Array(buffer, 16), dataType: THREE.HalfFloatType };
    if (format === 2)
      return { data: new Float32Array(buffer, 16), dataType: THREE.FloatType };
    throw new Error(`Unsupported raw format: ${format} (expected 1=Float16 or 2=Float32)`);
  }

  setInput(name: string, value: any) {
    const entry = this.inputsMap[name];
    if (!entry) return console.warn(`Input "${name}" does not exist`);

    // Handle array of vectors/matrices
    if (Array.isArray(value) && Array.isArray(value[0])) {
      entry.value = (value as number[][]).map((v) => this.createStructuredValue(entry.type, v));
    }
    // Handle single vector/matrix (copying into existing)
    else if (
      (entry.value instanceof THREE.Vector2 ||
        entry.value instanceof THREE.Vector3 ||
        entry.value instanceof THREE.Vector4 ||
        entry.value instanceof THREE.Matrix3 ||
        entry.value instanceof THREE.Matrix4) &&
      (value instanceof THREE.Vector2 ||
        value instanceof THREE.Vector3 ||
        value instanceof THREE.Vector4 ||
        value instanceof THREE.Matrix3 ||
        value instanceof THREE.Matrix4)
    ) {
      entry.value.copy(value);
    }
    // Handle primitives, textures, or replacement of vectors
    else
      entry.value = value;

    // Update the actual uniform
    if (this.uniforms[name])
      this.uniforms[name].value = entry.value;
  }

  updateShaders(vertexShader: string, fragmentShader: string) {
    this.vertexShader = vertexShader;
    this.fragmentShader = fragmentShader;
    this.needsUpdate = true;
  }
}
