import * as THREE from 'three';
import { base } from '$app/paths';

// Constant for 3D Atlas Reordering
const ATLAS_GRID_SIZE = 32;

// --- Type Definitions ---
export type ShaderInput =
	| { type: 'float' | 'int'; name: string; init?: number }
	| { type: 'vec2' | 'vec3' | 'vec4'; name: string; init?: number[] }
	| { type: 'mat3' | 'mat4'; name: string; init?: number[][] }
	| { type: 'texture2D' | 'texture3D'; name: string; init?: string };

// --- Main Class ---
export class ShaderTaskMaterial extends THREE.RawShaderMaterial {
	// Public members inherited from THREE.RawShaderMaterial:
	// this.vertexShader
	// this.fragmentShader
	// this.uniforms
	
	private textures: THREE.Texture[] = [];
	private pendingTextureLoads: Map<string, Promise<void>> = new Map();
	
	// Internal map to track input metadata (type, path)
	inputsMap: Record<
		string,
		{
			value: any;
			type: ShaderInput['type'];
			initPath?: string; 
		}
	> = {};

	constructor(params: { vertexShader: string; fragmentShader: string; inputs?: ShaderInput[] }) {
		// Three.js RawShaderMaterial configuration
		super({
			vertexShader: params.vertexShader,
			fragmentShader: params.fragmentShader,
			uniforms: {}, // Initialize uniforms object
			glslVersion: THREE.GLSL3
		});

		this.vertexShader = params.vertexShader;
		this.fragmentShader = params.fragmentShader;
		this.needsUpdate = true;

		if (params.inputs) {
			for (const input of params.inputs) this.addInput(input);
		}
	}

	/**
	 * Adds or updates a shader input (uniform).
	 * Handles creation of vectors/matrices and triggers texture loading.
	 */
	addInput(input: ShaderInput) {
		const name = input.name;
		let value: any = null;
		let initPath: string | undefined = undefined;
		const existingEntry = this.inputsMap[name];

		// 1. Determine the initial value based on type
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
				// Textures are handled asynchronously below
				value = existingEntry?.value instanceof THREE.Texture ? existingEntry.value : null;
				if (input.init) {
					initPath = this.resolvePath(input.init);
					
					// Check if we need to load or if we already have this texture
					if (existingEntry && existingEntry.initPath === initPath && existingEntry.value !== null) {
						// Path hasn't changed, and texture is already loaded/loading. Skip loading.
						return; 
					}

					// If path changed or it's a new input, trigger load
					this.loadTexture(input, initPath);
				}
				break;
		}

		// 2. Update internal maps and uniforms
		if (existingEntry) {
			// Update properties of existing uniform
			existingEntry.value = value;
			existingEntry.type = input.type;
			existingEntry.initPath = initPath;
			
			// Update the actual uniform value, ensuring we don't overwrite a loading texture with null
			if (!(input.type.startsWith('texture') && this.pendingTextureLoads.has(name))) {
				this.uniforms[name].value = value;
			}
		} else {
			// Create new uniform entry
			this.inputsMap[name] = { value, type: input.type, initPath };
			this.uniforms[name] = { value };
		}
	}

	/** Initialize vectors, matrices, or arrays of them */
	private initStructuredInput(input: ShaderInput) {
		const { type, init } = input;
		let arr: any[] = init === undefined ? [0] : Array.isArray(init) ? init : [init];

		if (!Array.isArray(arr[0])) {
			return this.createStructuredValue(type, arr as number[]);
		}
		// Handle array of vectors/matrices
		return (arr as number[][]).map((v) => this.createStructuredValue(type, v));
	}

	/** Creates the appropriate THREE.js object for structured types */
	private createStructuredValue(
		type: ShaderInput['type'],
		arr: number[]
	): THREE.Vector2 | THREE.Vector3 | THREE.Vector4 | THREE.Matrix3 | THREE.Matrix4 | number {
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
				// Should not happen, but return the first element for safety
				return arr[0] ?? 0;
		}
	}

	/** Standardized path resolution using SvelteKit's base path */
	private resolvePath(rawPath: string): string {
		if (!rawPath) return rawPath;
		// Ensure path starts with base/ or / if base is not defined
		const p = rawPath.startsWith('/') ? rawPath.slice(1) : rawPath;
		return base ? `${base}/${p}` : `/${p}`;
	}

	/** Load texture input (async) */
	private loadTexture(
		input: Extract<ShaderInput, { type: 'texture2D' | 'texture3D' }>,
		resolvedPath: string
	) {
		const name = input.name;

		if (this.pendingTextureLoads.has(name)) {
			console.warn(`Texture load for "${name}" already in progress. Ignoring new request.`);
			return;
		}

		const loadPromise = (async () => {
			try {
				let arrayData: Float32Array | Uint16Array;
				let width = 0, height = 0, depth = 1;
				let dataType: THREE.TextureDataType = THREE.FloatType;
				let format: THREE.PixelFormat = THREE.RedFormat;

				if (resolvedPath.toLowerCase().endsWith('.raw')) {
					// Raw file: fetch and parse
					const buffer = await fetch(resolvedPath).then((res) => res.arrayBuffer());
					const view = new DataView(buffer);
					width = view.getUint32(0, true);
					height = view.getUint32(4, true);
					depth = view.getUint32(8, true);
					const dataFormat = view.getUint32(12, true);
					const parsed = this.parseRawData(buffer, dataFormat);
					arrayData = parsed.data;
					dataType = parsed.dataType;
				} else {
					// Image file: load as ImageBitmap
					const loader = new THREE.ImageBitmapLoader();
					loader.setOptions({ imageOrientation: 'flipY' });
					const bitmap = await loader.loadAsync(resolvedPath);
					width = bitmap.width;
					height = bitmap.height;
					arrayData = this.bitmapToFloatArray(bitmap);
					depth = 1;

					// 3D Atlas Reordering Logic (Images only)
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
					dataType = THREE.FloatType;
				}
				
				// Create and configure texture
				let tex: THREE.Texture;

				if (input.type === 'texture3D') {
					tex = new THREE.Data3DTexture(arrayData, width, height, depth);
				} else {
					tex = new THREE.DataTexture(arrayData, width, height);
				}

				tex.format = format;
				tex.type = dataType;
				tex.colorSpace = THREE.NoColorSpace;
				tex.minFilter = tex.magFilter = THREE.LinearFilter;
				tex.unpackAlignment = 1; // 1 byte per component (RedFormat)
				tex.needsUpdate = true;

				// Store texture for eventual disposal
				this.textures.push(tex);

				// Update uniforms and internal map
				this.inputsMap[name].value = tex;
				if (this.uniforms[name]) this.uniforms[name].value = tex;
				
			} catch (err) {
				console.error(`Failed to load texture ${resolvedPath}:`, err);
				if (this.inputsMap[name]) this.inputsMap[name].value = null;
				if (this.uniforms[name]) this.uniforms[name].value = null;
			} finally {
				this.pendingTextureLoads.delete(name);
			}
		})();

		this.pendingTextureLoads.set(name, loadPromise);
	}

	/**
	 * Reorders a 2D atlas image (W x H) into a 3D volume (W_slice x H_slice x D).
	 */
	private reorder3DDataFrom2DAtlas(
		sourceArray: Float32Array,
		atlasWidth: number,
		atlasHeight: number
	): { reorderedData: Float32Array; w3d: number; h3d: number; d3d: number } {
		const grid = ATLAS_GRID_SIZE; // 32
		const totalSlices = grid * grid; // 1024

		const sliceW = Math.floor(atlasWidth / grid);
		const sliceH = Math.floor(atlasHeight / grid);
		const sliceSize = sliceW * sliceH;
		
		const targetArray = new Float32Array(sliceSize * totalSlices);
		let targetIndex = 0;

		for (let tileY = 0; tileY < grid; tileY++) {
			for (let tileX = 0; tileX < grid; tileX++) {
				const startX = tileX * sliceW;
				const startY = tileY * sliceH;

				for (let y = 0; y < sliceH; y++) {
					const rowStartIndex = (startY + y) * atlasWidth + startX;

					const sourceRow = sourceArray.subarray(
						rowStartIndex,
						rowStartIndex + sliceW
					);

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

	/** Convert ImageBitmap to Float32Array (red channel only, normalized 0-1) */
	private bitmapToFloatArray(bitmap: ImageBitmap): Float32Array {
		const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('Failed to create 2D context for ImageBitmap');
		
		// Use requestImageBitmap instead of drawing to canvas if possible for better performance,
		// but since we need pixel data for 3D reordering, canvas method is necessary.
		ctx.drawImage(bitmap, 0, 0);
		const imgData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
		
		const arr = new Float32Array(bitmap.width * bitmap.height);
		for (let i = 0; i < bitmap.width * bitmap.height; i++) {
			// Taking only the Red channel (index i * 4) and normalizing it to 0-1
			arr[i] = imgData.data[i * 4] / 255;
		}
		return arr;
	}

	/** Parses raw data buffer from a .raw file */
	private parseRawData(
		buffer: ArrayBuffer,
		format: number
	): { data: Float32Array | Uint16Array; dataType: THREE.TextureDataType } {
		// Data starts at byte 16 (after W, H, D, Format headers)
		if (format === 1)
			return { data: new Uint16Array(buffer, 16), dataType: THREE.HalfFloatType };
		if (format === 2)
			return { data: new Float32Array(buffer, 16), dataType: THREE.FloatType };
		throw new Error(`Unsupported raw format: ${format} (expected 1=Float16 or 2=Float32)`);
	}

	/** Sets the value of an existing uniform input */
	setInput(name: string, value: any) {
		const entry = this.inputsMap[name];
		if (!entry) {
			console.warn(`Input "${name}" does not exist in the material's definition.`);
			return;
		}

		// Handle array of vectors/matrices
		if (Array.isArray(value) && Array.isArray(value[0])) {
			entry.value = (value as number[][]).map((v) => this.createStructuredValue(entry.type, v));
		}
		// Handle single vector/matrix (copying into existing to avoid allocation)
		else if (
			entry.value instanceof THREE.Vector2 ||
			entry.value instanceof THREE.Vector3 ||
			entry.value instanceof THREE.Vector4 ||
			entry.value instanceof THREE.Matrix3 ||
			entry.value instanceof THREE.Matrix4
		) {
			if (
				value instanceof THREE.Vector2 ||
				value instanceof THREE.Vector3 ||
				value instanceof THREE.Vector4 ||
				value instanceof THREE.Matrix3 ||
				value instanceof THREE.Matrix4
			) {
				entry.value.copy(value as any);
			} else if (Array.isArray(value)) {
				// Allows setting a Vector with a simple array [x, y, z]
				(entry.value as any).set(...value); 
			} else {
				entry.value = value; // Fallback for incompatible type or primitive
			}
		}
		// Handle primitives, textures, or replacement of vectors
		else {
			entry.value = value;
		}

		// Update the actual uniform
		if (this.uniforms[name])
			this.uniforms[name].value = entry.value;
	}

	/** Updates shader source code and flags the material for re-compilation */
	updateShaders(vertexShader: string, fragmentShader: string) {
		this.vertexShader = vertexShader;
		this.fragmentShader = fragmentShader;
		this.needsUpdate = true; // Crucial Three.js flag for re-compilation
	}

	/** Clean up textures and inherited resources */
	override dispose() {
		// Dispose of dynamically created textures
		this.textures.forEach(tex => tex.dispose());
		this.textures = [];
		this.pendingTextureLoads.clear();
		
		// Call parent dispose method
		super.dispose();
	}
}