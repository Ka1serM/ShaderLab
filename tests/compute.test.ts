import { describe, expect, it } from 'vitest';
import { computeFragmentShader, parseComputeShader, sameLayout, withBufferAccess } from '../src/lib/renderer/gpu/compute';

const shader = `// @buffer particles count=3000
struct Particle {
    vec2 position;   // in world units
    vec2 velocity;
    float density, pressure;
};

Particle init(int i) { Particle p; return p; }
void update(int i) { write(particles(i)); }`;

describe('parseComputeShader', () => {
  it('reads the buffer layout and packs fields into vec4 slots', () => {
    const { layout, diagnostics } = parseComputeShader(shader);
    expect(diagnostics).toEqual([]);
    expect(layout).toMatchObject({ name: 'particles', struct: 'Particle', count: 3000, width: 2048, height: 2, slots: 2 });
    expect(layout!.fields.map(field => [field.name, field.offset])).toEqual([['position', 0], ['velocity', 2], ['density', 4], ['pressure', 5]]);
  });

  it('declares the generated functions without moving any line', () => {
    const { source } = parseComputeShader(shader);
    expect(source.split('\n').length).toBe(shader.split('\n').length);
    expect(source.split('\n')[5]).toBe('}; Particle particles(int i); void write(Particle value);');
  });

  it('reports missing pieces on the line they belong to', () => {
    expect(parseComputeShader('void main() {}').diagnostics[0].line).toBe(1);
    const badField = parseComputeShader('\n// @buffer cells count=4\nstruct Cell {\n  mat4 transform;\n};');
    expect(badField.diagnostics[0]).toMatchObject({ line: 4, message: 'Buffer fields are float, vec2, vec3 or vec4.' });
    const tooLarge = parseComputeShader('// @buffer cells count=4\nstruct Cell { vec4 a; vec4 b; vec4 c; vec4 d; float e; };');
    expect(tooLarge.diagnostics[0].message).toContain('at most 16');
    const noUpdate = parseComputeShader('// @buffer cells count=4\nstruct Cell { float a; };\nCell init(int i) { Cell c; return c; }');
    expect(noUpdate.diagnostics.map(diagnostic => diagnostic.message)).toEqual([expect.stringContaining('void update(int i)')]);
  });

  it('keeps state only for an identical layout', () => {
    const a = parseComputeShader(shader).layout!;
    expect(sameLayout(a, parseComputeShader(shader.replace('write(particles(i));', '')).layout!)).toBe(true);
    expect(sameLayout(a, parseComputeShader(shader.replace('count=3000', 'count=10')).layout!)).toBe(false);
  });
});

describe('generated code', () => {
  const parsed = parseComputeShader(shader);
  const layout = parsed.layout!;

  it('places the editable code after the hidden lines', () => {
    const { source, hiddenLines } = computeFragmentShader(layout, parsed.source);
    expect(source.split('\n')[hiddenLines]).toBe('// @buffer particles count=3000');
    expect(source).toContain('shaderlabOut1 = vec4(value.density, value.pressure, 0.0, 0.0);');
    expect(source).toContain('value.velocity = vec2(slot0.z, slot0.w);');
  });

  it('inserts buffer access after #version', () => {
    const { source, addedLines } = withBufferAccess(layout, '#version 300 es\nvoid main() {}');
    const lines = source.split('\n');
    expect(lines[0]).toBe('#version 300 es');
    expect(lines[1 + addedLines]).toBe('void main() {}');
  });
});
