import { writable } from 'svelte/store';

export class TaskSession {
  vertexShader = writable('');
  fragmentShader = writable('');
  activeTab = writable('fragment.glsl');
  shaderErrors = {
    vertex: writable([]),
    fragment: writable([]),
  };
  inputs = writable([]);

  constructor(init = {}) {
    if ('vertexShader' in init) this.vertexShader.set(init.vertexShader);
    if ('fragmentShader' in init) this.fragmentShader.set(init.fragmentShader);
    if ('activeTab' in init) this.activeTab.set(init.activeTab);
    if ('inputs' in init) this.inputs.set(init.inputs);

    if ('shaderErrors' in init) {
      if ('vertex' in init.shaderErrors)
        this.shaderErrors.vertex.set(init.shaderErrors.vertex);
      if ('fragment' in init.shaderErrors)
        this.shaderErrors.fragment.set(init.shaderErrors.fragment);
    }
  }
}
