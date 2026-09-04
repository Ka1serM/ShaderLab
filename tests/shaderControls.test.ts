import { describe, expect, it } from 'vitest';
import { controlValues, parseShaderControls } from '../src/lib/utils/shaderControls';

describe('parseShaderControls', () => {
  it('binds an annotation only to the next declaration', () => {
    const controls = parseShaderControls(`
      // @control light vector3 default=1,2,3 min=bad
      // explanatory comment
      uniform vec3 lightDirection;
      // @control strength slider default=0.5 min=0 max=1
      uniform float strength;
    `);
    expect(controls).toMatchObject([
      { id: 'light', uniform: 'lightDirection', default: [1, 2, 3], min: undefined },
      { id: 'strength', uniform: 'strength', default: 0.5, min: 0, max: 1 }
    ]);
  });

  it('does not cross another annotation while searching for a declaration', () => {
    const controls = parseShaderControls(`
      // @control abandoned slider default=1
      // @control actual slider default=2
      uniform float value;
    `);
    expect(controls[0].uniform).toBeUndefined();
    expect(controls[1].uniform).toBe('value');
  });

  it('rejects persisted values whose shape no longer matches', () => {
    const controls = parseShaderControls('// @control direction vector3 default=1,2,3\nuniform vec3 direction;');
    expect(controlValues(controls, { direction: 4 })).toEqual({ direction: [1, 2, 3] });
  });
});
