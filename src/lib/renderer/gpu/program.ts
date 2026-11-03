export type ShaderDiagnostic = {
  type: 'error' | 'warning';
  line: number;
  message: string;
  timestamp?: number;
};

export type ShaderDiagnostics = {
  vertex: ShaderDiagnostic[];
  fragment: ShaderDiagnostic[];
  compute: ShaderDiagnostic[];
};

/** A value a uniform can take. Matrices are column-major, as three.js stores them. */
export type UniformValue = number | boolean | ArrayLike<number>;

/** A texture bound to a sampler uniform. */
export type GpuTexture = { target: number; handle: WebGLTexture };

const VERSION = '#version 300 es\n';

function sourceForWebGL(source: string) {
  return source.trimStart().startsWith('#version')
    ? { source, addedLines: 0 }
    : { source: VERSION + source, addedLines: 1 };
}

function parseLog(log: string, addedLines: number, hiddenLines: number): ShaderDiagnostic[] {
  return log.split(/\r?\n/).map<ShaderDiagnostic | null>(rawLine => {
    const match = rawLine.trim().match(/^(?:(ERROR|WARNING)\s*:\s*)?(?:\d+\s*:\s*)?(\d+)(?:\s*\(\s*\d+\s*\))?\s*:\s*(.*)$/i);
    if (!match) return null;
    return {
      type: match[1]?.toLowerCase() === 'warning' ? 'warning' as const : 'error' as const,
      line: Math.max(1, Number(match[2]) - addedLines - hiddenLines),
      message: match[3].trim(),
      timestamp: Date.now()
    };
  }).filter((error): error is ShaderDiagnostic => error !== null);
}

export type CompileOptions = {
  /** Lines of hidden template before the editable code, so diagnostics point at editor lines. */
  hiddenLines?: { vertex: number; fragment: number };
  /** Varyings captured by transform feedback. They must be known before linking. */
  feedbackVaryings?: string[];
};

/**
 * Compiles and links once. The compile is the validation: a valid result is
 * the program that draws, so no shader is ever compiled twice.
 */
export function compileProgram(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string, options: CompileOptions = {}): { program?: Program; diagnostics: ShaderDiagnostics } {
  const hiddenLines = options.hiddenLines ?? { vertex: 0, fragment: 0 };
  const diagnostics: ShaderDiagnostics = { vertex: [], fragment: [], compute: [] };

  const compile = (type: number, source: string, stage: 'vertex' | 'fragment') => {
    const candidate = sourceForWebGL(source);
    const shader = gl.createShader(type);
    if (!shader) {
      diagnostics[stage].push({ type: 'error', line: 1, message: `Could not create ${stage} shader.` });
      return null;
    }
    gl.shaderSource(shader, candidate.source);
    gl.compileShader(shader);
    diagnostics[stage] = parseLog(gl.getShaderInfoLog(shader) ?? '', candidate.addedLines, hiddenLines[stage]);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      if (!diagnostics[stage].length) diagnostics[stage].push({ type: 'error', line: 1, message: `${stage} shader compilation failed.` });
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  };

  const vertex = compile(gl.VERTEX_SHADER, vertexSource, 'vertex');
  const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource, 'fragment');
  if (!vertex || !fragment) {
    if (vertex) gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
    return { diagnostics };
  }

  const handle = gl.createProgram();
  if (!handle) {
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    diagnostics.fragment.push({ type: 'error', line: 1, message: 'Could not create shader program.' });
    return { diagnostics };
  }
  gl.attachShader(handle, vertex);
  gl.attachShader(handle, fragment);
  if (options.feedbackVaryings?.length) gl.transformFeedbackVaryings(handle, options.feedbackVaryings, gl.INTERLEAVED_ATTRIBS);
  gl.linkProgram(handle);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(handle, gl.LINK_STATUS)) {
    const log = (gl.getProgramInfoLog(handle) ?? '').trim();
    diagnostics.fragment.push({ type: 'error', line: 1, message: log || 'Shader program linking failed.', timestamp: Date.now() });
    gl.deleteProgram(handle);
    return { diagnostics };
  }
  return { program: new Program(gl, handle), diagnostics };
}

type Uniform = {
  name: string;
  type: number;
  size: number;
  location: WebGLUniformLocation;
  /** Texture unit, for samplers. */
  unit?: number;
  /** What the GPU holds, so an unchanged value is never uploaded again. */
  uploaded?: Float64Array;
};

export type Attribute = { name: string; type: number; location: number };

/** Components per element of each uniform type. */
function components(gl: WebGL2RenderingContext, type: number) {
  switch (type) {
    case gl.FLOAT_VEC2: case gl.INT_VEC2: case gl.BOOL_VEC2: case gl.UNSIGNED_INT_VEC2: return 2;
    case gl.FLOAT_VEC3: case gl.INT_VEC3: case gl.BOOL_VEC3: case gl.UNSIGNED_INT_VEC3: return 3;
    case gl.FLOAT_VEC4: case gl.INT_VEC4: case gl.BOOL_VEC4: case gl.UNSIGNED_INT_VEC4: case gl.FLOAT_MAT2: return 4;
    case gl.FLOAT_MAT3: return 9;
    case gl.FLOAT_MAT4: return 16;
    default: return 1;
  }
}

function isSampler(gl: WebGL2RenderingContext, type: number) {
  return ([gl.SAMPLER_2D, gl.SAMPLER_3D, gl.SAMPLER_CUBE, gl.SAMPLER_2D_ARRAY, gl.SAMPLER_2D_SHADOW,
    gl.INT_SAMPLER_2D, gl.INT_SAMPLER_3D, gl.UNSIGNED_INT_SAMPLER_2D, gl.UNSIGNED_INT_SAMPLER_3D] as number[]).includes(type);
}

/**
 * A linked program and what it declares. Uniform types come from the linked
 * program, so a value is always uploaded the way the shader reads it: an
 * `ivec2` gets integers, a `bool` gets 0 or 1. Values are recorded with `set()`
 * at any time and uploaded by `bind()`, and only when they changed.
 */
export class Program {
  readonly uniforms = new Map<string, Uniform>();
  readonly attributes = new Map<string, Attribute>();
  private readonly values = new Map<string, UniformValue | undefined>();
  private readonly textures = new Map<string, GpuTexture | null>();
  private readonly changed = new Set<string>();
  private disposed = false;

  constructor(private readonly gl: WebGL2RenderingContext, readonly handle: WebGLProgram) {
    const uniformCount = gl.getProgramParameter(handle, gl.ACTIVE_UNIFORMS) as number;
    let unit = 0;
    for (let index = 0; index < uniformCount; index++) {
      const info = gl.getActiveUniform(handle, index);
      if (!info) continue;
      const name = info.name.replace(/\[0\]$/, '');
      const location = gl.getUniformLocation(handle, info.name);
      if (!location) continue;
      this.uniforms.set(name, { name, type: info.type, size: info.size, location, unit: isSampler(gl, info.type) ? unit++ : undefined });
    }
    const attributeCount = gl.getProgramParameter(handle, gl.ACTIVE_ATTRIBUTES) as number;
    for (let index = 0; index < attributeCount; index++) {
      const info = gl.getActiveAttrib(handle, index);
      if (!info || info.name.startsWith('gl_')) continue;
      this.attributes.set(info.name, { name: info.name, type: info.type, location: gl.getAttribLocation(handle, info.name) });
    }
    // Sampler units never change, so they are assigned once.
    gl.useProgram(handle);
    for (const uniform of this.uniforms.values()) if (uniform.unit !== undefined) gl.uniform1i(uniform.location, uniform.unit);
    gl.useProgram(null);
  }

  /** Whether the linked program uses `name`. The compiler drops unused uniforms. */
  uses(name: string) {
    return this.uniforms.has(name) || this.attributes.has(name);
  }

  /** `undefined` resets the uniform to zero, as in a freshly linked program. */
  set(name: string, value: UniformValue | undefined) {
    if (!this.uniforms.has(name)) return;
    this.values.set(name, value);
    this.changed.add(name);
  }

  setTexture(name: string, texture: GpuTexture | null) {
    if (this.uniforms.get(name)?.unit === undefined) return;
    this.textures.set(name, texture);
  }

  /** Makes this the current program, uploads changed values and binds its textures. */
  bind() {
    const gl = this.gl;
    gl.useProgram(this.handle);
    for (const name of this.changed) this.upload(this.uniforms.get(name)!, this.values.get(name));
    this.changed.clear();
    for (const [name, texture] of this.textures) {
      const uniform = this.uniforms.get(name)!;
      gl.activeTexture(gl.TEXTURE0 + uniform.unit!);
      if (texture) gl.bindTexture(texture.target, texture.handle);
      else {
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.bindTexture(gl.TEXTURE_3D, null);
      }
    }
    gl.activeTexture(gl.TEXTURE0);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.gl.deleteProgram(this.handle);
  }

  private upload(uniform: Uniform, value: UniformValue | undefined) {
    const gl = this.gl;
    const length = components(gl, uniform.type) * uniform.size;
    const next = new Float64Array(length);
    if (typeof value === 'number') next[0] = value;
    else if (typeof value === 'boolean') next[0] = value ? 1 : 0;
    else if (value) for (let index = 0; index < Math.min(length, value.length); index++) next[index] = value[index];
    const previous = uniform.uploaded;
    if (previous && previous.every((component, index) => component === next[index])) return;
    uniform.uploaded = next;
    const location = uniform.location;
    const floats = () => Float32Array.from(next);
    const ints = () => Int32Array.from(next, Math.trunc);
    const bools = () => Int32Array.from(next, component => component ? 1 : 0);
    const uints = () => Uint32Array.from(next, component => Math.max(0, Math.trunc(component)));
    switch (uniform.type) {
      case gl.FLOAT: gl.uniform1fv(location, floats()); break;
      case gl.FLOAT_VEC2: gl.uniform2fv(location, floats()); break;
      case gl.FLOAT_VEC3: gl.uniform3fv(location, floats()); break;
      case gl.FLOAT_VEC4: gl.uniform4fv(location, floats()); break;
      case gl.INT: gl.uniform1iv(location, ints()); break;
      case gl.INT_VEC2: gl.uniform2iv(location, ints()); break;
      case gl.INT_VEC3: gl.uniform3iv(location, ints()); break;
      case gl.INT_VEC4: gl.uniform4iv(location, ints()); break;
      case gl.BOOL: gl.uniform1iv(location, bools()); break;
      case gl.BOOL_VEC2: gl.uniform2iv(location, bools()); break;
      case gl.BOOL_VEC3: gl.uniform3iv(location, bools()); break;
      case gl.BOOL_VEC4: gl.uniform4iv(location, bools()); break;
      case gl.UNSIGNED_INT: gl.uniform1uiv(location, uints()); break;
      case gl.UNSIGNED_INT_VEC2: gl.uniform2uiv(location, uints()); break;
      case gl.UNSIGNED_INT_VEC3: gl.uniform3uiv(location, uints()); break;
      case gl.UNSIGNED_INT_VEC4: gl.uniform4uiv(location, uints()); break;
      case gl.FLOAT_MAT2: gl.uniformMatrix2fv(location, false, floats()); break;
      case gl.FLOAT_MAT3: gl.uniformMatrix3fv(location, false, floats()); break;
      case gl.FLOAT_MAT4: gl.uniformMatrix4fv(location, false, floats()); break;
    }
  }
}
