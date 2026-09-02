import * as THREE from 'three';
import { base } from '$app/paths';

const ATLAS_GRID_SIZE = 32;

export type ShaderInput =
	| { type: 'float' | 'int'; name: string; init?: number }
	| { type: 'vec2' | 'vec3' | 'vec4'; name: string; init?: number[] }
	| { type: 'mat3' | 'mat4'; name: string; init?: number[][] }
	| { type: 'texture2D' | 'texture3D'; name: string; init?: string };

export class ShaderTaskMaterial extends THREE.RawShaderMaterial {
	private textures = new Set<THREE.Texture>();
	private pendingTextureLoads = new Map<string, { path: string; revision: number; controller: AbortController; promise: Promise<void> }>();
	private inputRevisions = new Map<string, number>();
	private disposed = false;
	private loadGeneration = 0;
	private shaderRevision = 0;
	
	inputsMap: Record<
		string,
		{
			value: any;
			type: ShaderInput['type'];
			initPath?: string; 
		}
	> = {};

	constructor(params: { vertexShader: string; fragmentShader: string; inputs?: ShaderInput[] }) {
		super({
			vertexShader: params.vertexShader,
			fragmentShader: params.fragmentShader,
			uniforms: {},
			glslVersion: THREE.GLSL3,
			side: THREE.DoubleSide
		});

		this.vertexShader = params.vertexShader;
		this.fragmentShader = params.fragmentShader;
		this.needsUpdate = true;

		if (params.inputs) {
			for (const input of params.inputs) this.addInput(input);
		}
	}

	override customProgramCacheKey() {
		return `shaderlab-${this.shaderRevision}`;
	}

	addInput(input: ShaderInput) {
		const name = input.name;
		let value: any = null;
		let initPath: string | undefined = undefined;
		const existingEntry = this.inputsMap[name];

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
				value = existingEntry?.value instanceof THREE.Texture ? existingEntry.value : null;
				if (input.init) {
					initPath = this.resolvePath(input.init);
					
					if (existingEntry && existingEntry.initPath === initPath && existingEntry.value !== null) {
						return; 
					}

					this.loadTexture(input, initPath);
				}
				break;
		}

		if (existingEntry) {
			existingEntry.value = value;
			existingEntry.type = input.type;
			existingEntry.initPath = initPath;
			
			if (!(input.type.startsWith('texture') && this.pendingTextureLoads.has(name))) {
				this.uniforms[name].value = value;
			}
		} else {
			this.inputsMap[name] = { value, type: input.type, initPath };
			this.uniforms[name] = { value };
		}
	}

	removeInput(name: string) {
		const pending = this.pendingTextureLoads.get(name);
		pending?.controller.abort();
		this.pendingTextureLoads.delete(name);
		this.inputRevisions.set(name, (this.inputRevisions.get(name) ?? 0) + 1);
		const value = this.inputsMap[name]?.value;
		if (value instanceof THREE.Texture) {
			value.dispose();
			this.textures.delete(value);
		}
		delete this.inputsMap[name];
		delete this.uniforms[name];
	}

	private initStructuredInput(input: ShaderInput) {
		const { type, init } = input;
		let arr: any[] = init === undefined ? [0] : Array.isArray(init) ? init : [init];

		if (!Array.isArray(arr[0])) {
			return this.createStructuredValue(type, arr as number[]);
		}
		return (arr as number[][]).map((v) => this.createStructuredValue(type, v));
	}

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
			default: return arr[0] ?? 0;
		}
	}

	private resolvePath(rawPath: string): string {
		if (!rawPath) return rawPath;
		const p = rawPath.startsWith('/') ? rawPath.slice(1) : rawPath;
		return base ? `${base}/${p}` : `/${p}`;
	}

	private loadTexture(
		input: Extract<ShaderInput, { type: 'texture2D' | 'texture3D' }>,
		resolvedPath: string
	) {
		const name = input.name;
		const generation = this.loadGeneration;
		const previous = this.pendingTextureLoads.get(name);
		if (previous?.path === resolvedPath) return;
		previous?.controller.abort();
		const controller = new AbortController();
		const revision = (this.inputRevisions.get(name) ?? 0) + 1;
		this.inputRevisions.set(name, revision);

		const loadPromise = (async () => {
			try {
				let arrayData: Float32Array | Uint16Array;
				let width = 0, height = 0, depth = 1;
				let dataType: THREE.TextureDataType = THREE.FloatType;
				let format: THREE.PixelFormat = THREE.RedFormat;

				if (resolvedPath.toLowerCase().endsWith('.raw')) {
					const response = await fetch(resolvedPath, { signal: controller.signal });
					if (!response.ok) throw new Error(`HTTP ${response.status} while loading ${resolvedPath}`);
					const buffer = await response.arrayBuffer();
					if (buffer.byteLength < 16) throw new Error('Raw texture file is missing its 16-byte header');
					const view = new DataView(buffer);
					width = view.getUint32(0, true);
					height = view.getUint32(4, true);
					depth = view.getUint32(8, true);
					const dataFormat = view.getUint32(12, true);
					if (!width || !height || !depth) throw new Error('Raw texture dimensions must be non-zero');
					const bytesPerValue = dataFormat === 1 ? 2 : dataFormat === 2 ? 4 : 0;
					const expectedBytes = width * height * depth * bytesPerValue;
					if (!bytesPerValue || !Number.isSafeInteger(expectedBytes) || expectedBytes > 512 * 1024 * 1024) {
						throw new Error('Raw texture dimensions or format are invalid');
					}
					if (buffer.byteLength !== 16 + expectedBytes) throw new Error(`Raw texture payload has ${buffer.byteLength - 16} bytes; expected ${expectedBytes}`);
					const parsed = this.parseRawData(buffer, dataFormat);
					arrayData = parsed.data;
					dataType = parsed.dataType;
				} else {
					const loader = new THREE.ImageBitmapLoader();
					loader.setOptions({ imageOrientation: 'flipY' });
					const bitmap = await loader.loadAsync(resolvedPath);
					try {
						width = bitmap.width;
						height = bitmap.height;
						arrayData = this.bitmapToFloatArray(bitmap);
					} finally {
						bitmap.close();
					}
					depth = 1;

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
				tex.unpackAlignment = 1;
				tex.needsUpdate = true;

				if (this.disposed || generation !== this.loadGeneration || revision !== this.inputRevisions.get(name)) {
					tex.dispose();
					return;
				}

				const oldTexture = this.inputsMap[name]?.value;
				if (oldTexture instanceof THREE.Texture && oldTexture !== tex) {
					oldTexture.dispose();
					this.textures.delete(oldTexture);
				}
				this.textures.add(tex);

				this.inputsMap[name].value = tex;
				if (this.uniforms[name]) this.uniforms[name].value = tex;
				
			} catch (err) {
				if (controller.signal.aborted) return;
				console.error(`Failed to load texture ${resolvedPath}:`, err);
				if (!this.disposed && generation === this.loadGeneration && revision === this.inputRevisions.get(name)) {
					if (this.inputsMap[name]) this.inputsMap[name].value = null;
					if (this.uniforms[name]) this.uniforms[name].value = null;
				}
			} finally {
				if (this.pendingTextureLoads.get(name)?.revision === revision) this.pendingTextureLoads.delete(name);
			}
		})();

		this.pendingTextureLoads.set(name, { path: resolvedPath, revision, controller, promise: loadPromise });
	}

	private reorder3DDataFrom2DAtlas(
		sourceArray: Float32Array,
		atlasWidth: number,
		atlasHeight: number
	): { reorderedData: Float32Array; w3d: number; h3d: number; d3d: number } {
		const grid = ATLAS_GRID_SIZE;
		const totalSlices = grid * grid;

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
		let entry = this.inputsMap[name];
		if (!entry) {
			const type: ShaderInput['type'] = Array.isArray(value) && value.length === 16
				? 'mat4'
				: Array.isArray(value) && value.length === 9
				? 'mat3'
				: Array.isArray(value)
				? (`vec${value.length}` as ShaderInput['type'])
				: 'float';
			const structuredValue = Array.isArray(value) ? this.createStructuredValue(type, value) : value;
			entry = this.inputsMap[name] = { value: structuredValue, type };
			this.uniforms[name] = { value: structuredValue };
		}

		if (Array.isArray(value) && Array.isArray(value[0])) {
			entry.value = (value as number[][]).map((v) => this.createStructuredValue(entry.type, v));
		}
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
				if (entry.value instanceof THREE.Matrix3 || entry.value instanceof THREE.Matrix4) entry.value.fromArray(value);
				else (entry.value as any).set(...value);
			} else {
				entry.value = value;
			}
		}
		else {
			entry.value = value;
		}

		if (this.uniforms[name])
			this.uniforms[name].value = entry.value;
	}

	updateShaders(vertexShader: string, fragmentShader: string) {
		this.vertexShader = vertexShader;
		this.fragmentShader = fragmentShader;
		this.shaderRevision += 1;
		this.needsUpdate = true;
	}

	override dispose() {
		this.disposed = true;
		this.loadGeneration += 1;
		this.pendingTextureLoads.forEach(load => load.controller.abort());
		this.textures.forEach(tex => tex.dispose());
		this.textures.clear();
		this.pendingTextureLoads.clear();
		
		super.dispose();
	}
}
