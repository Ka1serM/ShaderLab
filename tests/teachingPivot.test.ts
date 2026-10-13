import { describe, expect, it } from 'vitest';
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { bindShaderTransforms } from '../src/lib/utils/shaderTransforms';
import { controlValues, parseShaderControls } from '../src/lib/utils/shaderControls';

const translation = (v: number[]) => new Matrix4().makeTranslation(...v as [number, number, number]);

describe('teaching pivot frame', () => {
  it('binds arbitrary shader names and updates only rotation when rotating', () => {
    const controls = parseShaderControls(`
      // @control default=2,0,0
      uniform vec3 handleOrigin;
      // @control transform=translate pivot=handleOrigin
      uniform mat4 move;
      // @control transform=rotate
      uniform mat4 turn;
      // @control transform=scale
      uniform mat4 resize;
    `);
    const values = controlValues(controls, {});
    const binding = bindShaderTransforms(controls, values, 0);
    expect(binding.state!.position).toEqual([2, 0, 0]);
    const updates = binding.transformUpdates({ ...binding.state!, quaternion: new Quaternion().setFromEuler(new Euler(0, 0, 1)).toArray() });
    expect(Object.keys(updates)).toEqual(['turn']);
    expect(bindShaderTransforms(controls, { ...values, ...updates }, 0).state!.position).toEqual([2, 0, 0]);
  });

  it('places the gizmo at a pivot that the shader derives as a readback', () => {
    const controls = parseShaderControls(`
      // @control transform=translate pivot=pivotPoint
      uniform mat4 move;
      void main() {
        // @readback
        vec3 pivotPoint = vec3(1.0, 0.0, 0.0);
      }
    `);
    const values = { ...controlValues(controls, {}), pivotPoint: [1, 0, 0] };
    const binding = bindShaderTransforms(controls, values, 0);
    expect(binding.state!.position).toEqual([1, 0, 0]);
    expect(binding.transformUpdates({ ...binding.state!, position: [3, 0, 0] })).toEqual({ move: translation([2, 0, 0]).toArray() });
  });

  it('supports shaders without a pivot annotation', () => {
    const controls = parseShaderControls('// @control transform=translate\nuniform mat4 move;');
    const binding = bindShaderTransforms(controls, controlValues(controls, {}), 0);
    expect(binding.state!.position).toEqual([0, 0, 0]);
    expect(binding.transformUpdates({ ...binding.state!, position: [1, 2, 3] })).toEqual({ move: translation([1, 2, 3]).toArray() });
  });
  it('binds only the transform controls of the selected object', () => {
    const controls = parseShaderControls(`
      // @control transform=translate object=0
      uniform mat4 cameraMove;
      // @control transform=translate object=1 default="1,0,0,0,0,1,0,0,0,0,1,0,0,0,-3,1"
      uniform mat4 meshMove;
    `);
    const values = controlValues(controls, {});
    expect(bindShaderTransforms(controls, values, 0).state!.position).toEqual([0, 0, 0]);
    const meshBinding = bindShaderTransforms(controls, values, 1);
    expect(meshBinding.state!.position).toEqual([0, 0, -3]);
    expect(Object.keys(meshBinding.transformUpdates({ ...meshBinding.state!, position: [1, 0, -3] }))).toEqual(['meshMove']);
    expect(bindShaderTransforms(controls, values, 2).state).toBeUndefined();
  });

  it('rotates an offset mesh around the world origin with identity local translation', () => {
    const pivot = [0, 0, 0];
    const localTranslation = new Matrix4();
    const rotation = new Matrix4().makeRotationZ(Math.PI / 2);
    const meshMatrix = localTranslation.clone().multiply(translation(pivot)).multiply(rotation).multiply(translation([2, 0, 0]));
    const point = new Vector3().applyMatrix4(meshMatrix);
    expect(point.x).toBeCloseTo(0);
    expect(point.y).toBeCloseTo(2);
    expect(localTranslation.elements).toEqual(new Matrix4().elements);
  });
});
