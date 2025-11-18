import * as THREE from 'three';
import { get } from 'svelte/store';

export class ShaderTaskMaterial extends THREE.RawShaderMaterial {
  textures = [];
  pendingTextureLoads = new Map();
  _unsubscribers = [];

  /**
   * @param {Object} options
   * @param {import('svelte/store').Writable<string>} options.vertexStore
   * @param {import('svelte/store').Writable<string>} options.fragmentStore
   * @param {ShaderParameter[]} options.inputStores  // NOT a Svelte store, but an array
   */
  constructor({ vertexStore, fragmentStore, inputStores = [] }) {
    super({
      vertexShader: get(vertexStore),
      fragmentShader: get(fragmentStore),
      uniforms: {},
      glslVersion: THREE.GLSL3
    });

    this.vertexStore = vertexStore;
    this.fragmentStore = fragmentStore;
    this.inputStores = inputStores;
    this.inputsMap = {};

    // --- Shader hot reload subscriptions ---
    this._unsubscribers.push(
      vertexStore.subscribe(v => {
        this.vertexShader = v;
        this.needsUpdate = true;
      })
    );

    this._unsubscribers.push(
      fragmentStore.subscribe(f => {
        this.fragmentShader = f;
        this.needsUpdate = true;
      })
    );

    // --- Input uniforms (params) ---
    for (const param of inputStores) {
      const initialValue = get(param.value);

      // Initialize the uniform
      this.addInput({ ...param, value: initialValue });

      // Subscribe to changes in param.value
      this._unsubscribers.push(
        param.value.subscribe(val => {
          this.addInput({ ...param, value: val });
        })
      );
    }
  }

  /** Assign or update a uniform */
  addInput({ name, type, value }) {
    this.inputsMap[name] = value;

    // Texture types
    if (type === 'texture2D' || type === 'texture3D') {
      if (typeof value === 'string') {
        this.loadTexture(name, value);
      } else {
        this.uniforms[name] = { value };
      }
      return;
    }

    // Scalar / vector / matrix
    this.uniforms[name] = { value };
  }

  /** Load texture with indexedDB caching */
  async loadTexture(name, path) {
    if (this.pendingTextureLoads.has(name)) return;

    this.pendingTextureLoads.set(name, true);

    try {
      let tex;
      const cached = await this.getCachedTexture(path);

      if (cached) {
        const bitmap = await createImageBitmap(cached);
        tex = new THREE.Texture(bitmap);
      } else {
        const blob = await fetch(path).then(r => r.blob());
        await this.setCachedTexture(path, blob);
        const bitmap = await createImageBitmap(blob);
        tex = new THREE.Texture(bitmap);
      }

      tex.needsUpdate = true;

      this.inputsMap[name] = tex;
      this.uniforms[name] = { value: tex };
      this.textures.push(tex);
    } catch (err) {
      console.error(`Failed to load texture ${path}`, err);
    } finally {
      this.pendingTextureLoads.delete(name);
    }
  }

  // IndexedDB helpers
  async openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('ShaderTextureCache', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('textures');
      request.onsuccess = () => resolve(request.result);
      request.onerror = e => reject(e);
    });
  }

  async getCachedTexture(path) {
    const db = await this.openDB();
    return new Promise(resolve => {
      const tx = db.transaction('textures', 'readonly');
      const store = tx.objectStore('textures');
      const req = store.get(path);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
  }

  async setCachedTexture(path, data) {
    const db = await this.openDB();
    return new Promise(resolve => {
      const tx = db.transaction('textures', 'readwrite');
      const store = tx.objectStore('textures');
      const req = store.put(data, path);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  }

  /** Cleanup */
  dispose() {
    // Unsubscribe all Svelte store subscriptions
    for (const unsub of this._unsubscribers) {
      unsub();
    }
    this._unsubscribers = [];

    // Dispose textures
    this.textures.forEach(t => t.dispose());
    this.textures = [];

    this.pendingTextureLoads.clear();

    // Dispose material
    super.dispose();
  }
}
