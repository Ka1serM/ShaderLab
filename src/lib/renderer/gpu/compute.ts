import type { Node, Tree } from 'web-tree-sitter';
import { withGlslTree } from '$lib/glsl/parser';
import type { ShaderDiagnostic } from './program';


export type FieldType = 'float' | 'vec2' | 'vec3' | 'vec4';

export type BufferField = { name: string; type: FieldType;  offset: number };

export type BufferLayout = {
  name: string;
  struct: string;
  count: number;
  width: number;
  height: number;
  slots: number;
  fields: BufferField[];
};

const SIZES: Record<FieldType, number> = { float: 1, vec2: 2, vec3: 3, vec4: 4 };
const COMPONENTS = ['x', 'y', 'z', 'w'];
const MAX_FLOATS = 16;
const MAX_COUNT = 1 << 20;
const MAX_WIDTH = 2048;

export function dispatchVertexShader(layout: BufferLayout) {
  return `flat out int index;
void main() {
  index = gl_VertexID;
  vec2 texel = vec2(gl_VertexID % ${layout.width}, gl_VertexID / ${layout.width}) + 0.5;
  gl_Position = vec4(texel / vec2(${layout.width}.0, ${layout.height}.0) * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = 1.0;
}`;
}

export const bufferSampler = (slot: number) => `shaderlabBuffer${slot}`;

export type ParsedCompute = {
  layout?: BufferLayout;
  output?: string;
  source: string;
  diagnostics: ShaderDiagnostic[];
};

type Edit = { start: number; end: number; text: string };

function applyEdits(source: string, edits: Edit[]) {
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  return source;
}

const line = (node: Node) => node.startPosition.row + 1;
const replace = (node: Node, text: string): Edit => ({ start: node.startIndex, end: node.endIndex, text });

function topLevel(tree: Tree, type: string) {
  return tree.rootNode.namedChildren.filter((node): node is Node => node?.type === type);
}

function qualifiedDeclarations(tree: Tree, qualifier: string) {
  return topLevel(tree, 'declaration').filter(node => node.children.some(child => child?.type === qualifier));
}

function arrayUniform(tree: Tree, matches: (type: string, name: string) => boolean) {
  return qualifiedDeclarations(tree, 'uniform').flatMap(node => {
    const declarator = node.childForFieldName('declarator');
    const name = declarator?.childForFieldName('declarator');
    const size = declarator?.childForFieldName('size');
    const type = node.childForFieldName('type')?.text;
    return declarator?.type === 'array_declarator' && name && size && type && matches(type, name.text)
      ? [{ node, type, name: name.text, size }]
      : [];
  });
}

function arrayAccess(tree: Tree, name: string, count: number): Edit[] {
  const subscripts = tree.rootNode.descendantsOfType('subscript_expression').flatMap(node => {
    if (node?.childForFieldName('argument')?.text !== name) return [];
    const open = node.children.find(child => child?.type === '[');
    const close = node.children.findLast(child => child?.type === ']');
    return open && close ? [replace(open, '('), replace(close, ')')] : [];
  });
  const lengths = tree.rootNode.descendantsOfType('call_expression').flatMap(node => {
    const callee = node?.childForFieldName('function');
    const isLength = callee?.type === 'field_expression' && callee.childForFieldName('argument')?.text === name
      && callee.childForFieldName('field')?.text === 'length' && !node!.childForFieldName('arguments')?.namedChildCount;
    return isLength ? [replace(node!, String(count))] : [];
  });
  return [...subscripts, ...lengths];
}

function parseFields(struct: Node): BufferField[] | ShaderDiagnostic {
  const fields: BufferField[] = [];
  let offset = 0;
  for (const declaration of struct.childForFieldName('body')?.namedChildren ?? []) {
    if (declaration?.type !== 'field_declaration') continue;
    const type = declaration.childForFieldName('type')?.text as FieldType;
    const names = declaration.childrenForFieldName('declarator');
    if (!(type in SIZES) || names.some(name => name?.type !== 'field_identifier')) return error(line(declaration), 'Fields of a state struct are float, vec2, vec3 or vec4.');
    for (const name of names) {
      fields.push({ name: name!.text, type, offset });
      offset += SIZES[type];
    }
  }
  const structName = struct.childForFieldName('name')?.text;
  if (!fields.length) return error(line(struct), `${structName} needs at least one field.`);
  if (offset > MAX_FLOATS) return error(line(struct), `${structName} holds ${offset} floats; a state element holds at most ${MAX_FLOATS}.`);
  return fields;
}

function error(line: number, message: string): ShaderDiagnostic {
  return { type: 'error', line, message, timestamp: Date.now() };
}

export function parseComputeShader(source: string): ParsedCompute {
  return withGlslTree(source, (tree): ParsedCompute => {
    const fail = (at: number, message: string): ParsedCompute => ({ source, diagnostics: [error(at, message)] });
    const outputs = qualifiedDeclarations(tree, 'out');
    if (outputs.length !== 1) return fail(outputs[1] ? line(outputs[1]) : 1, 'A compute shader has exactly one output, the new state of its element, for example: out Particle particle;');
    const output = outputs[0];
    const structName = output.childForFieldName('type')?.text ?? '';
    const outputName = output.childForFieldName('declarator')?.text ?? '';
    const arrays = arrayUniform(tree, type => type === structName);
    if (arrays.length !== 1) return fail(arrays[1] ? line(arrays[1].node) : line(output), `Declare the state as exactly one uniform array of the output's type, for example: uniform ${structName} state[1024];`);
    const array = arrays[0];
    const count = array.size.type === 'number_literal' ? Number(array.size.text) : NaN;
    if (!Number.isSafeInteger(count) || count < 1 || count > MAX_COUNT) return fail(line(array.node), `The array holds between 1 and ${MAX_COUNT} elements.`);
    const struct = topLevel(tree, 'struct_specifier').find(node => node.childForFieldName('name')?.text === structName);
    const fields = structName in SIZES ? [{ name: '', type: structName as FieldType, offset: 0 }]
      : struct ? parseFields(struct)
      : error(line(output), 'The state is a struct, float, vec2, vec3 or vec4.');
    if (!Array.isArray(fields)) return { source, diagnostics: [fields] };
    const main = topLevel(tree, 'function_definition')
      .map(node => node.childForFieldName('declarator')?.childForFieldName('declarator'))
      .find(name => name?.text === 'main');
    if (!main) return fail(line(output), 'Define void main(). It runs once per element.');

    const width = Math.min(count, MAX_WIDTH);
    const slots = Math.ceil((fields.at(-1)!.offset + SIZES[fields.at(-1)!.type]) / 4);
    const layout: BufferLayout = { name: array.name, struct: structName, count, width, height: Math.ceil(count / width), slots, fields };
    const instrumented = applyEdits(source, [
      replace(array.node, `${structName} ${array.name}(int i);`),
      ...arrayAccess(tree, array.name, count),
      replace(output, `${structName} ${outputName};`),
      replace(main, 'shaderlabMain')
    ]);
    return { layout, output: outputName, source: instrumented, diagnostics: [] };
  });
}

export function sameLayout(a: BufferLayout, b: BufferLayout) {
  return a.name === b.name && a.struct === b.struct && a.count === b.count
    && a.fields.length === b.fields.length && a.fields.every((field, index) => field.name === b.fields[index].name && field.type === b.fields[index].type);
}

function component(offset: number) {
  return `slot${Math.floor(offset / 4)}.${COMPONENTS[offset % 4]}`;
}

function samplers(layout: BufferLayout) {
  return Array.from({ length: layout.slots }, (_, slot) => `uniform highp sampler2D ${bufferSampler(slot)};`);
}

function readFunction(layout: BufferLayout, struct = layout.struct) {
  const lines = [
    `${struct} ${layout.name}(int i) {`,
    `  highp int element = clamp(i, 0, ${layout.count - 1});`,
    `  highp ivec2 texel = ivec2(element % ${layout.width}, element / ${layout.width});`,
    ...Array.from({ length: layout.slots }, (_, slot) => `  highp vec4 slot${slot} = texelFetch(${bufferSampler(slot)}, texel, 0);`),
    `  ${struct} value;`
  ];
  for (const field of layout.fields) {
    const parts = Array.from({ length: SIZES[field.type] }, (_, index) => component(field.offset + index));
    lines.push(`  value${field.name ? `.${field.name}` : ''} = ${field.type === 'float' ? parts[0] : `${field.type}(${parts.join(', ')})`};`);
  }
  lines.push('  return value;', '}');
  return lines;
}

export function computeFragmentShader({ layout, output, source }: Required<Pick<ParsedCompute, 'layout' | 'output' | 'source'>>) {
  const floats: string[] = Array(layout.slots * 4).fill('0.0');
  for (const field of layout.fields) {
    const value = field.name ? `${output}.${field.name}` : output;
    for (let index = 0; index < SIZES[field.type]; index++) floats[field.offset + index] = field.type === 'float' ? value : `${value}.${COMPONENTS[index]}`;
  }
  const prefix = [
    ...Array.from({ length: layout.slots }, (_, slot) => `layout(location = ${slot}) out vec4 shaderlabOut${slot};`),
    ...samplers(layout)
  ];
  const suffix = [
    ...readFunction(layout),
    'void main() {',
    `  ${output} = ${layout.name}(int(gl_FragCoord.y) * ${layout.width} + int(gl_FragCoord.x));`,
    '  shaderlabMain();',
    ...Array.from({ length: layout.slots }, (_, slot) => `  shaderlabOut${slot} = vec4(${floats.slice(slot * 4, slot * 4 + 4).join(', ')});`),
    '}'
  ];
  return { source: [...prefix, source, ...suffix].join('\n'), hiddenLines: prefix.length };
}

export function withBufferAccess(layout: BufferLayout, source: string) {
  return withGlslTree(source, tree => {
    const declaration = arrayUniform(tree, (_, name) => name === layout.name)[0];
    if (!declaration) return source;
    const rewritten = applyEdits(source, [
      replace(declaration.node, `${samplers(layout).join(' ')} ${declaration.type} ${layout.name}(int i);`),
      ...arrayAccess(tree, layout.name, layout.count)
    ]);
    return `${rewritten}\n${readFunction(layout, declaration.type).join('\n')}`;
  });
}
