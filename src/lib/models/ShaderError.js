/**
 * Represents a GLSL shader compilation error or warning
 */
export class ShaderError {
  type = 'error';
  line = 0;
  message = '';
  timestamp = undefined;

  constructor(init = {}) {
    Object.assign(this, init);
  }
}
