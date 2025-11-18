import { writable } from 'svelte/store';

/**
 * Represents a shader uniform input (float, vec, color, texture, etc.)
 */
export class ShaderParameter {
  type = 'float';
  name = '';
  value = null;

  constructor(init = {}) {
    this.type = init.type ?? 'float';
    this.name = init.name ?? '';
    this.value = writable(init.value);
  }
}
