import { writable } from 'svelte/store';

/**
 * Represents a shader task with starter code, theory, and input definitions
 */
export class Task {
  title = writable('');
  task = writable('');
  theory = writable('');
  hints = writable([]);
  starterVertexShader = writable('');
  starterFragmentShader = writable('');
  referenceVertexShader = writable('');
  referenceFragmentShader = writable('');
  modelPath = writable('');
  type = writable('2D');
  instanceCount = writable(1);
  inputs = writable([]);

  constructor(init = {}) {
    if ('title' in init) this.title.set(init.title);
    if ('task' in init) this.task.set(init.task);
    if ('theory' in init) this.theory.set(init.theory);
    if ('hints' in init) this.hints.set(init.hints);
    if ('starterVertexShader' in init) this.starterVertexShader.set(init.starterVertexShader);
    if ('starterFragmentShader' in init) this.starterFragmentShader.set(init.starterFragmentShader);
    if ('referenceVertexShader' in init) this.referenceVertexShader.set(init.referenceVertexShader);
    if ('referenceFragmentShader' in init) this.referenceFragmentShader.set(init.referenceFragmentShader);
    if ('modelPath' in init) this.modelPath.set(init.modelPath);
    if ('type' in init) this.type.set(init.type);
    if ('instanceCount' in init) this.instanceCount.set(init.instanceCount);
    if ('inputs' in init) this.inputs.set(init.inputs);
  }
}