import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { controlValues, parseShaderControls } from '../src/lib/utils/shaderControls';

describe('parseShaderControls', () => {
  it.each([
    ['transformations.md', 6],
    ['projection.md', 9],
    ['shading.md', 5],
    ['illumination.md', 5]
  ])('parses every annotation in %s', (file, expectedCount) => {
    const source = readFileSync(resolve('static/content/teaching', file), 'utf8');
    const annotationCount = source.match(/^\s*\/\/\s*@(control|readback)\b/gm)?.length ?? 0;
    const controls = parseShaderControls(source);
    expect(annotationCount).toBe(expectedCount);
    expect(controls).toHaveLength(expectedCount);
    expect(new Set(controls.map(control => control.id)).size).toBe(expectedCount);
  });

  it('binds an annotation only to the next declaration', () => {
    const controls = parseShaderControls(`
      // @control default=1,2,3 min=bad
      // explanatory comment
      uniform vec3 lightDirection;
      // @control default=0.5 min=0 max=1
      uniform float strength;
    `);
    expect(controls).toMatchObject([
      { id: 'lightDirection', uniform: 'lightDirection', type: 'vector3', default: [1, 2, 3], min: undefined },
      { id: 'strength', uniform: 'strength', default: 0.5, min: 0, max: 1 }
    ]);
  });

  it('does not cross another annotation while searching for a declaration', () => {
    const controls = parseShaderControls(`
      // @control default=1
      // @control default=2
      uniform float value;
    `);
    expect(controls).toMatchObject([{ id: 'value', uniform: 'value', default: 2 }]);
  });

  it('rejects persisted values whose shape no longer matches', () => {
    const controls = parseShaderControls('// @control default=1,2,3\nuniform vec3 direction;');
    expect(controlValues(controls, { direction: 4 })).toEqual({ direction: [1, 2, 3] });
  });

  it('falls back safely when annotated defaults are malformed', () => {
    const controls = parseShaderControls(`
      // @control default=not-a-number
      uniform float amount;
      // @control default=1,2
      uniform vec3 direction;
      // @control default=1,2,3
      uniform mat4 transform;
    `);
    expect(controls.map(control => control.default)).toEqual([
      0,
      [0, 0, 0],
      [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    ]);
  });

  it('infers generic transform roles only for matrix controls', () => {
    const controls = parseShaderControls(`
      // @control transform=translate
      uniform mat4 translation;
      // @control transform=rotate
      uniform vec3 invalidRotation;
    `);
    expect(controls).toMatchObject([
      { id: 'translation', transform: 'translate' },
      { id: 'invalidRotation', transform: undefined }
    ]);
  });

  it('makes visualized controls editable through their own uniform', () => {
    const controls = parseShaderControls(`
      // @control visualize=point
      uniform vec3 pivot;
      // @control visualize=vector
      uniform vec3 direction;
    `);
    expect(controls).toMatchObject([
      { id: 'pivot', visualization: 'point', editable: true, target: 'pivot' },
      { id: 'direction', visualization: 'vector', editable: true, target: 'direction' }
    ]);
  });

  it('allows an explicit display override without duplicating the GLSL type', () => {
    const controls = parseShaderControls(`
      // @control display=color default=0.1,0.2,0.3
      uniform vec3 ambient;
    `);
    expect(controls[0]).toMatchObject({ id: 'ambient', uniform: 'ambient', type: 'color' });
  });

  it('rejects the legacy positional control syntax', () => {
    const controls = parseShaderControls('// @control ambient color default=1,1,1\nuniform vec3 ambient;');
    expect(controls).toEqual([]);
  });

  it('supports hidden editable readback visualizations linked to a control', () => {
    const controls = parseShaderControls(`
      // @readback visualize=point target=pivot inverse=objectMatrix
      vec3 pivotWorld = vec3(0.0);
    `);
    expect(controls[0]).toMatchObject({
      id: 'pivotWorld', readback: 'pivotWorld', visualization: 'point', editable: true,
      hidden: true, target: 'pivot', inverse: 'objectMatrix'
    });
  });
});
