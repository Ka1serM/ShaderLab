import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { initGlslParser } from '../src/lib/glsl/parser';
import { computeFragmentShader, dispatchVertexShader, parseComputeShader, sameLayout, withBufferAccess } from '../src/lib/renderer/gpu/compute';

const shader = `struct Particle {
    vec2 position;   // in world units
    vec2 velocity;
    float density, pressure;
};

uniform Particle particles[3000];
flat in int index;
out Particle particle;
uniform int frame;

void main() {
    if (frame == 0) particle = Particle(vec2(0.0), vec2(0.0), 0.0, 0.0);
    else particle.velocity = particles[clamp(index + 1, 0, particles.length() - 1)].velocity;
}`;

await initGlslParser(readFileSync('src/lib/glsl/tree-sitter-glsl.wasm'));

const lines = (text: string) => text.split('\n');

describe('parseComputeShader', () => {
  it('reads the layout of the array whose type is that of the output', () => {
    const { layout, output, diagnostics } = parseComputeShader(shader);
    expect(diagnostics).toEqual([]);
    expect(output).toBe('particle');
    expect(layout).toMatchObject({ name: 'particles', struct: 'Particle', count: 3000, width: 2048, height: 2, slots: 2 });
    expect(layout!.fields.map(field => [field.name, field.offset])).toEqual([['position', 0], ['velocity', 2], ['density', 4], ['pressure', 5]]);
  });

  it('takes a float or vector state as a single field', () => {
    const { layout } = parseComputeShader('uniform vec4 cells[64];\nuniform vec3 lights[4];\nout vec4 cell;\nvoid main() {}');
    expect(layout).toMatchObject({ name: 'cells', struct: 'vec4', count: 64, slots: 1, fields: [{ name: '', type: 'vec4', offset: 0 }] });
  });

  it('rewrites the declarations and every access line for line', () => {
    const { source } = parseComputeShader(shader);
    expect(lines(source)).toHaveLength(lines(shader).length);
    expect(lines(source)[6]).toBe('Particle particles(int i);');
    expect(lines(source)[8]).toBe('Particle particle;');
    expect(lines(source)[11]).toBe('void shaderlabMain() {');
    expect(lines(source)[13]).toBe('    else particle.velocity = particles(clamp(index + 1, 0, 3000 - 1)).velocity;');
  });

  it('reports what is missing', () => {
    expect(parseComputeShader('void main() {}').diagnostics[0].message).toContain('exactly one output');
    expect(parseComputeShader('struct Cell { float a; };\nout Cell cell;\nvoid main() {}').diagnostics[0]).toMatchObject({ line: 2, message: expect.stringContaining('uniform Cell state[1024]') });
    const badField = parseComputeShader('struct Cell {\n  mat4 transform;\n};\nuniform Cell cells[4];\nout Cell cell;');
    expect(badField.diagnostics[0]).toMatchObject({ line: 2, message: 'Fields of a state struct are float, vec2, vec3 or vec4.' });
    const tooLarge = parseComputeShader('struct Cell { vec4 a; vec4 b; vec4 c; vec4 d; float e; };\nuniform Cell cells[4];\nout Cell cell;');
    expect(tooLarge.diagnostics[0].message).toContain('at most 16');
    expect(parseComputeShader('uniform vec4 cells[4];\nout vec4 cell;').diagnostics[0].message).toContain('void main()');
  });

  it('keeps state only for an identical layout', () => {
    const a = parseComputeShader(shader).layout!;
    expect(sameLayout(a, parseComputeShader(shader.replace('if (frame == 0) ', 'if (true) ')).layout!)).toBe(true);
    expect(sameLayout(a, parseComputeShader(shader.replace('[3000]', '[10]')).layout!)).toBe(false);
  });
});

describe('generated code', () => {
  const parsed = parseComputeShader(shader);
  const layout = parsed.layout!;

  it('keeps the current state, runs main() and stores the output', () => {
    const { source, hiddenLines } = computeFragmentShader({ layout, output: parsed.output!, source: parsed.source });
    expect(lines(source)[hiddenLines]).toBe('struct Particle {');
    expect(source).toContain('particle = particles(int(gl_FragCoord.y) * 2048 + int(gl_FragCoord.x));\n  shaderlabMain();');
    expect(source).toContain('shaderlabOut1 = vec4(particle.density, particle.pressure, 0.0, 0.0);');
    expect(source).toContain('value.velocity = vec2(slot0.z, slot0.w);');
    expect(source.replace(parsed.source, '')).not.toMatch(/\b(index|frame|deltaTime)\b/);
  });

  it('stores a vector state directly', () => {
    const cells = parseComputeShader('uniform vec2 cells[8];\nout vec2 cell;\nvoid main() {}');
    const { source } = computeFragmentShader({ layout: cells.layout!, output: cells.output!, source: cells.source });
    expect(source).toContain('shaderlabOut0 = vec4(cell.x, cell.y, 0.0, 0.0);');
    expect(source).toContain('value = vec2(slot0.x, slot0.y);');
  });

  it('hands each element its index from the dispatch vertex shader', () => {
    expect(dispatchVertexShader(layout)).toContain('flat out int index;');
  });

  it('lets a drawing shader read the array it declares, line for line', () => {
    const vertex = 'struct Particle { vec2 position; vec2 velocity; float density, pressure; };\nuniform Particle particles[3000];\nvoid main() { gl_Position = vec4(particles[gl_InstanceID].position, 0.0, 1.0); }';
    const access = withBufferAccess(layout, vertex);
    expect(lines(access)[1]).toBe('uniform highp sampler2D shaderlabBuffer0; uniform highp sampler2D shaderlabBuffer1; Particle particles(int i);');
    expect(lines(access)[2]).toContain('particles(gl_InstanceID).position');
    expect(access).toContain('Particle particles(int i) {');
    expect(withBufferAccess(layout, 'void main() {}')).toBe('void main() {}');
  });
});
