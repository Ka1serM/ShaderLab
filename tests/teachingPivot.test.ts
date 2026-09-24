import { describe, expect, it } from 'vitest';
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { bindShaderTransforms, rebasePivotTranslation } from '../src/lib/utils/shaderTransforms';
import { controlValues, parseShaderControls } from '../src/lib/utils/shaderControls';

const translation = (v: number[]) => new Matrix4().makeTranslation(...v as [number, number, number]);

describe('teaching pivot frame', () => {
  it('binds arbitrary shader names and updates only rotation when rotating', () => {
    const controls = parseShaderControls(`
      // @control pivot=true pivotOffset=meshOrigin default=2,0,0
      uniform vec3 handleOrigin;
      // @control hidden=true default=-2,0,0
      uniform vec3 meshOrigin;
      // @control transform=translate
      uniform mat4 move;
      // @control transform=rotate
      uniform mat4 turn;
      // @control transform=scale
      uniform mat4 resize;
    `);
    const values = controlValues(controls, {});
    const binding = bindShaderTransforms(controls, values);
    expect(binding.state!.position).toEqual([2, 0, 0]);
    const updates = binding.transformUpdates({ ...binding.state!, quaternion: new Quaternion().setFromEuler(new Euler(0, 0, 1)).toArray() });
    expect(Object.keys(updates)).toEqual(['turn']);
    expect(binding.valueUpdates('handleOrigin', [3, 0, 0])).toEqual({
      handleOrigin: [3, 0, 0], meshOrigin: [-3, 0, 0], move: translation([0, 0, 0]).toArray()
    });
    expect(bindShaderTransforms(controls, { ...values, ...updates }).state!.position).toEqual([2, 0, 0]);
  });

  it('supports shaders without a pivot annotation', () => {
    const controls = parseShaderControls('// @control transform=translate\nuniform mat4 move;');
    const binding = bindShaderTransforms(controls, controlValues(controls, {}));
    expect(binding.state!.position).toEqual([0, 0, 0]);
    expect(binding.transformUpdates({ ...binding.state!, position: [1, 2, 3] })).toEqual({ move: translation([1, 2, 3]).toArray() });
  });
  it('keeps the mesh stationary when moving a pivot after rotation and nonuniform scale', () => {
    const previous = [2, -1, 3], next = [-4, 2, 1], offset = [-2, 1, -3];
    const rotation = new Matrix4().makeRotationFromQuaternion(new Quaternion().setFromEuler(new Euler(.4, -.7, .2)));
    const scale = new Matrix4().makeScale(2, 3, .5);
    const rebasedTranslation = rebasePivotTranslation(previous, next, offset, new Matrix4().toArray(), rotation.toArray(), scale.toArray());
    const before = translation(previous).multiply(rotation).multiply(scale).multiply(translation(offset));
    const after = new Matrix4().fromArray(rebasedTranslation).multiply(translation(next)).multiply(rotation).multiply(scale).multiply(translation(next.map(value => -value)));
    before.elements.forEach((value, index) => expect(after.elements[index]).toBeCloseTo(value, 10));
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

  it('can move a pivot even when the scale is collapsed', () => {
    const translationMatrix = rebasePivotTranslation([0, 0, 0], [1, 0, 0], [0, 0, 0], new Matrix4().toArray(), new Matrix4().toArray(), new Matrix4().makeScale(0, 1, 1).toArray());
    expect(new Vector3().setFromMatrixPosition(new Matrix4().fromArray(translationMatrix)).toArray()).toEqual([-1, 0, 0]);
  });
});
