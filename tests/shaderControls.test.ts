import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { initGlslParser } from '../src/lib/glsl/parser';
import { controlValues, parseShaderControls } from '../src/lib/utils/shaderControls';

beforeAll(() => initGlslParser(readFileSync('src/lib/glsl/tree-sitter-glsl.wasm')));

describe('parseShaderControls', () => {
  it.each([
    ['transformations.md', 8],
    ['projection.md', 16],
    ['shading.md', 5],
    ['illumination.md', 6]
  ])('parses every annotation in %s without errors', (file, expectedCount) => {
    const source = readFileSync(resolve('src/content/teaching', file), 'utf8');
    const { controls, errors } = parseShaderControls(source);
    expect(errors).toEqual([]);
    expect(controls).toHaveLength(expectedCount);
  });

  it('binds an annotation to the next declaration, past plain comments', () => {
    const { controls } = parseShaderControls(`
      // @control { default: [1, 2, 3] }
      // explanatory comment
      uniform vec3 lightDirection;
      // @control { default: 0.5, min: 0, max: 1 }
      uniform float strength;
    `);
    expect(controls).toMatchObject([
      { id: 'lightDirection', uniform: 'lightDirection', type: 'vector3', default: [1, 2, 3] },
      { id: 'strength', uniform: 'strength', type: 'slider', default: 0.5, min: 0, max: 1 }
    ]);
  });

  it('defaults by GLSL type', () => {
    const { controls } = parseShaderControls('// @control\nuniform float a;\n// @control\nuniform bool b;\n// @control\nuniform mat4 m;');
    expect(controls.map(control => control.default)).toEqual([0, false, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]]);
  });

  it('turns options on an int uniform into an options control', () => {
    const { controls } = parseShaderControls('// @control { label: Pivot, options: [Center, Right], default: 1 }\nuniform int uPivot;');
    expect(controls).toMatchObject([{ id: 'uPivot', type: 'options', options: ['Center', 'Right'], default: 1 }]);
    expect(controlValues(controls, { uPivot: 0 })).toEqual({ uPivot: 0 });
    expect(controlValues(controls, { uPivot: 0.5 })).toEqual({ uPivot: 1 });
    expect(controlValues(controls, { uPivot: 2 })).toEqual({ uPivot: 1 });
  });

  it('shows a vec3 as a color on request', () => {
    const { controls } = parseShaderControls('// @control { display: color, default: [0.1, 0.2, 0.3] }\nuniform vec3 ambient;');
    expect(controls[0]).toMatchObject({ id: 'ambient', type: 'color', default: [0.1, 0.2, 0.3] });
  });

  it('makes visualized uniforms editable and visualized readbacks hidden', () => {
    const { controls } = parseShaderControls(`
      // @control { visualize: point }
      uniform vec3 pivot;
      void main() {
        // @readback { visualize: vector }
        vec3 direction = vec3(1.0);
      }
    `);
    expect(controls).toMatchObject([
      { id: 'pivot', visualization: 'point', editable: true, hidden: false },
      { id: 'direction', readback: 'direction', visualization: 'vector', editable: false, hidden: true }
    ]);
  });

  it('rejects persisted values whose shape no longer matches', () => {
    const { controls } = parseShaderControls('// @control { default: [1, 2, 3] }\nuniform vec3 direction;');
    expect(controlValues(controls, { direction: 4 })).toEqual({ direction: [1, 2, 3] });
  });

  it('reports every broken annotation with its line and keeps the others', () => {
    const { controls, errors } = parseShaderControls([
      '// @control { default: [1, 2] }',
      'uniform vec3 a;',
      '// @control { colour: red }',
      'uniform vec3 b;',
      '// @control { label: Unclosed',
      'uniform float c;',
      '// @control { transform: rotate }',
      'uniform vec3 d;',
      '// @control',
      'float notUniform;',
      '// @control',
      'uniform mat3 e;',
      '// @control { default: 2 }',
      'uniform float ok;'
    ].join('\n'));
    expect(controls.map(control => control.id)).toEqual(['ok']);
    expect(errors.map(error => error.line)).toEqual([1, 3, 5, 7, 9, 11]);
  });

  it('reads annotations inside functions and ignores block comments', () => {
    const { controls } = parseShaderControls('/* @control */\nuniform float hidden;\nvoid main() {\n  // @readback { label: Result }\n  mat4 m = mat4(1.0);\n}');
    expect(controls).toMatchObject([{ id: 'm', type: 'matrix4', label: 'Result', readOnly: true }]);
  });
});
