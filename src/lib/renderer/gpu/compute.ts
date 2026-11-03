import type { ShaderDiagnostic } from './program';

/**
 * Compute shaders in WebGL2. A compute stage declares one buffer of structs:
 *
 *     // @buffer particles count=1024
 *     struct Particle { vec2 position; vec2 velocity; };
 *
 *     Particle init(int i) { ... }      // the start state of element i
 *     void update(int i) { ... }        // reads with particles(j), writes with write(p)
 *
 * The buffer lives in float textures, one RGBA texel per element and texture,
 * up to four textures (16 floats). Each step draws a full-screen triangle into
 * the next set of textures, so every element is one fragment: it may read any
 * element of the current state, but writes only its own next state.
 */

export type FieldType = 'float' | 'vec2' | 'vec3' | 'vec4';

export type BufferField = { name: string; type: FieldType; /** In floats from the start of the element. */ offset: number };

export type BufferLayout = {
  /** The buffer's name, which is also the name of its read function. */
  name: string;
  struct: string;
  count: number;
  /** Texture size. Element `i` is texel `(i % width, i / width)`. */
  width: number;
  height: number;
  /** Number of RGBA textures. */
  slots: number;
  fields: BufferField[];
};

const SIZES: Record<FieldType, number> = { float: 1, vec2: 2, vec3: 3, vec4: 4 };
const COMPONENTS = ['x', 'y', 'z', 'w'];
const MAX_FLOATS = 16;
const MAX_COUNT = 1 << 20;
const MAX_WIDTH = 2048;
const HEADER = ['precision highp float;', 'precision highp int;', 'precision highp sampler2D;'];

/** Uniforms every compute stage can read without declaring them. */
export const COMPUTE_UNIFORMS = [
  'uniform float time;',
  'uniform float deltaTime;',
  'uniform vec2 iResolution;',
  'uniform vec3 iMouse;',
  'uniform vec3 pointerPosition;',
  'uniform vec3 pointerVelocity;',
  'uniform bool pointerDown;',
  'uniform bool shaderlabReset;'
];

/** The vertex shader of every dispatch: one triangle that covers the whole buffer texture. */
export const DISPATCH_VERTEX_SHADER = `#version 300 es
void main() {
  vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}`;

export const bufferSampler = (slot: number) => `shaderlabBuffer${slot}`;

export type ParsedCompute = {
  layout?: BufferLayout;
  /** The source with declarations of the generated functions added after the struct, on the same line. */
  source: string;
  /** Line numbers are those of the parsed source. */
  diagnostics: ShaderDiagnostic[];
};

function lineAt(source: string, index: number) {
  return source.slice(0, index).split('\n').length;
}

function stripComments(text: string) {
  // Keeps newlines, so offsets into the text still give the right line.
  return text.replace(/\/\*[\s\S]*?\*\//g, match => match.replace(/[^\n]/g, ' ')).replace(/\/\/[^\n]*/g, match => ' '.repeat(match.length));
}

export function parseComputeShader(source: string): ParsedCompute {
  const error = (line: number, message: string): ParsedCompute => ({ source, diagnostics: [{ type: 'error', line, message, timestamp: Date.now() }] });
  const annotations = [...source.matchAll(/^[ \t]*\/\/[ \t]*@buffer\b(.*)$/gm)];
  if (!annotations.length) return error(1, 'A compute shader declares its buffer first, for example: // @buffer particles count=1024');
  if (annotations.length > 1) return error(lineAt(source, annotations[1].index!), 'A compute shader has exactly one @buffer.');
  const annotation = annotations[0];
  const annotationLine = lineAt(source, annotation.index!);
  const arguments_ = annotation[1].match(/^[ \t]+([A-Za-z_]\w*)[ \t]+count[ \t]*=[ \t]*(\d+)[ \t]*$/);
  if (!arguments_) return error(annotationLine, 'Write the buffer as: // @buffer <name> count=<number of elements>');
  const [, name, countText] = arguments_;
  const count = Number(countText);
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_COUNT) return error(annotationLine, `The element count must be between 1 and ${MAX_COUNT}.`);

  const code = stripComments(source);
  const structPattern = /\bstruct\s+([A-Za-z_]\w*)\s*\{([^}]*)\}\s*;/g;
  structPattern.lastIndex = annotation.index! + annotation[0].length;
  const struct = structPattern.exec(code);
  if (!struct) return error(annotationLine, 'Declare the element type after @buffer, for example: struct Particle { vec2 position; };');
  const structName = struct[1];
  const bodyStart = struct.index + struct[0].indexOf('{') + 1;

  const fields: BufferField[] = [];
  let offset = 0;
  let declarationStart = bodyStart;
  for (const declaration of struct[2].split(';')) {
    const line = lineAt(source, declarationStart + (declaration.length - declaration.trimStart().length));
    declarationStart += declaration.length + 1;
    if (!declaration.trim()) continue;
    const match = declaration.trim().match(/^(?:(?:highp|mediump|lowp)\s+)?(float|vec2|vec3|vec4)\s+([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)$/);
    if (!match) return error(line, 'Buffer fields are float, vec2, vec3 or vec4.');
    for (const fieldName of match[2].split(',').map(part => part.trim())) {
      const type = match[1] as FieldType;
      fields.push({ name: fieldName, type, offset });
      offset += SIZES[type];
    }
  }
  if (!fields.length) return error(lineAt(source, struct.index), `${structName} needs at least one field.`);
  if (offset > MAX_FLOATS) return error(lineAt(source, struct.index), `${structName} holds ${offset} floats; a buffer element holds at most ${MAX_FLOATS}.`);

  const missing: string[] = [];
  if (!new RegExp(`\\b${structName}\\s+init\\s*\\(\\s*int\\s+\\w+\\s*\\)\\s*\\{`).test(code)) missing.push(`${structName} init(int i), which returns the start state of element i`);
  if (!/\bvoid\s+update\s*\(\s*int\s+\w+\s*\)\s*\{/.test(code)) missing.push(`void update(int i), which reads with ${name}(j) and stores the new state with write(...)`);
  if (missing.length) return { source, diagnostics: missing.map(message => ({ type: 'error', line: annotationLine, message: `Define ${message}.`, timestamp: Date.now() })) };

  const width = Math.min(count, MAX_WIDTH);
  const layout: BufferLayout = { name, struct: structName, count, width, height: Math.ceil(count / width), slots: Math.ceil(offset / 4), fields };
  // Declared on the line of the struct, so no line of the student's code moves.
  const structEnd = struct.index + struct[0].length;
  const instrumented = `${source.slice(0, structEnd)} ${structName} ${name}(int i); void write(${structName} value);${source.slice(structEnd)}`;
  return { layout, source: instrumented, diagnostics: [] };
}

/** Whether a buffer with layout `b` can continue from the state of a buffer with layout `a`. */
export function sameLayout(a: BufferLayout, b: BufferLayout) {
  return a.name === b.name && a.struct === b.struct && a.count === b.count
    && a.fields.length === b.fields.length && a.fields.every((field, index) => field.name === b.fields[index].name && field.type === b.fields[index].type);
}

function component(offset: number) {
  return `slot${Math.floor(offset / 4)}.${COMPONENTS[offset % 4]}`;
}

function declarations(layout: BufferLayout) {
  return [
    ...Array.from({ length: layout.slots }, (_, slot) => `uniform highp sampler2D ${bufferSampler(slot)};`),
    `const int ${layout.name}Count = ${layout.count};`
  ];
}

function readFunction(layout: BufferLayout) {
  const lines = [
    `${layout.struct} ${layout.name}(int i) {`,
    `  i = clamp(i, 0, ${layout.count - 1});`,
    `  ivec2 texel = ivec2(i % ${layout.width}, i / ${layout.width});`,
    ...Array.from({ length: layout.slots }, (_, slot) => `  vec4 slot${slot} = texelFetch(${bufferSampler(slot)}, texel, 0);`),
    `  ${layout.struct} value;`
  ];
  for (const field of layout.fields) {
    const parts = Array.from({ length: SIZES[field.type] }, (_, index) => component(field.offset + index));
    lines.push(`  value.${field.name} = ${field.type === 'float' ? parts[0] : `${field.type}(${parts.join(', ')})`};`);
  }
  lines.push('  return value;', '}');
  return lines;
}

function writeFunction(layout: BufferLayout) {
  const floats: string[] = Array(layout.slots * 4).fill('0.0');
  for (const field of layout.fields) {
    for (let index = 0; index < SIZES[field.type]; index++) floats[field.offset + index] = field.type === 'float' ? `value.${field.name}` : `value.${field.name}.${COMPONENTS[index]}`;
  }
  return [
    `void write(${layout.struct} value) {`,
    ...Array.from({ length: layout.slots }, (_, slot) => `  shaderlabOut${slot} = vec4(${floats.slice(slot * 4, slot * 4 + 4).join(', ')});`),
    '}'
  ];
}

/** The fragment shader of one dispatch, and how many hidden lines precede the parsed source. */
export function computeFragmentShader(layout: BufferLayout, parsedSource: string) {
  const prefix = [
    '#version 300 es',
    ...HEADER,
    ...COMPUTE_UNIFORMS,
    ...Array.from({ length: layout.slots }, (_, slot) => `layout(location = ${slot}) out vec4 shaderlabOut${slot};`),
    ...declarations(layout)
  ];
  const suffix = [
    ...readFunction(layout),
    ...writeFunction(layout),
    'void main() {',
    `  int i = int(gl_FragCoord.y) * ${layout.width} + int(gl_FragCoord.x);`,
    // An element that update() does not write keeps its state.
    `  write(${layout.name}(i));`,
    '  if (shaderlabReset) write(init(i));',
    '  else update(i);',
    '}'
  ];
  return { source: [...prefix, parsedSource, ...suffix].join('\n'), hiddenLines: prefix.length };
}

/**
 * Lets a drawing shader read the buffer: the struct, the element count and the
 * read function, inserted before its first line (after `#version`, if any).
 */
export function withBufferAccess(layout: BufferLayout, source: string) {
  const prelude = [
    ...HEADER,
    ...declarations(layout),
    `struct ${layout.struct} {`,
    ...layout.fields.map(field => `  ${field.type} ${field.name};`),
    '};',
    ...readFunction(layout)
  ];
  const version = source.match(/^\s*#version[^\n]*\n/);
  const head = version ? version[0] : '';
  return { source: head + prelude.join('\n') + '\n' + source.slice(head.length), addedLines: prelude.length };
}
