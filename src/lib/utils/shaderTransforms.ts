import { Matrix4, Quaternion, Vector3 } from 'three';
import type { TeachingControl, TeachingValue } from './shaderControls';
import type { TransformMode, ViewportTransform } from '../renderer/Renderer';

/** Shared annotation binding; no lesson IDs or uniform names are assumed. */
export function bindShaderTransforms(controls: TeachingControl[], values: Record<string, TeachingValue>) {
  const transforms = Object.fromEntries(controls.filter(control => control.transform).map(control => [control.transform, control])) as Partial<Record<TransformMode, TeachingControl>>;
  const modes = (['translate', 'rotate', 'scale'] as TransformMode[]).filter(role => transforms[role]);
  const pivotControl = controls.find(control => control.pivot && control.uniform);
  const pivot = new Vector3().fromArray(pivotControl ? values[pivotControl.id] as number[] : [0, 0, 0]);
  const matrix = (role: TransformMode) => {
    const control = transforms[role];
    const value = control ? values[control.id] : undefined;
    return Array.isArray(value) && value.length === 16 && value.every(Number.isFinite)
      ? new Matrix4().fromArray(value) : new Matrix4();
  };
  const position = new Vector3(), quaternion = new Quaternion(), scale = new Vector3();
  matrix('translate').decompose(position, new Quaternion(), new Vector3());
  matrix('rotate').decompose(new Vector3(), quaternion, new Vector3());
  matrix('scale').decompose(new Vector3(), new Quaternion(), scale);
  position.add(pivot);
  const state: ViewportTransform | undefined = modes.length ? {
    position: position.toArray(), quaternion: quaternion.toArray(), scale: scale.toArray()
  } : undefined;

  return {
    modes,
    state,
    transformUpdates(transform: ViewportTransform): Record<string, TeachingValue> {
      const localPosition = new Vector3().fromArray(transform.position).sub(pivot);
      const matrices = {
        translate: new Matrix4().makeTranslation(localPosition.x, localPosition.y, localPosition.z),
        rotate: new Matrix4().makeRotationFromQuaternion(new Quaternion().fromArray(transform.quaternion)),
        scale: new Matrix4().makeScale(...transform.scale)
      };
      // Do not rewrite other controls due to decomposition round-off.
      return Object.fromEntries(modes.flatMap(role => {
        const next = matrices[role].toArray();
        const previous = matrix(role).toArray();
        return next.every((value, index) => Math.abs(value - previous[index]) < 1e-12)
          ? [] : [[transforms[role]!.id, next]];
      }));
    },
    valueUpdates(id: string, value: TeachingValue): Record<string, TeachingValue> {
      if (id === pivotControl?.id && pivotControl.pivotOffset && Array.isArray(value)) {
        const offsetControl = controls.find(control => control.type === 'vector3' && control.uniform === pivotControl.pivotOffset);
        const translationControl = transforms.translate;
        if (offsetControl && translationControl) {
          const translation = rebasePivotTranslation(
            pivot.toArray(), value, values[offsetControl.id] as number[],
            matrix('translate').toArray(), matrix('rotate').toArray(), matrix('scale').toArray()
          );
          return {
            [id]: value,
            [offsetControl.id]: new Vector3().fromArray(value).negate().toArray().map(component => Object.is(component, -0) ? 0 : component),
            [translationControl.id]: translation
          };
        }
      }
      return { [id]: value };
    }
  };
}

/**
 * Move the pivot while preserving the mesh transform.
 *
 * Keep the mesh offset equal to -pivot, then compensate the outer
 * translation. This makes the pivot move in world space; the previous
 * offset-rebase strategy kept the outer translation fixed and only moved an
 * internal handle.
 */
export function rebasePivotTranslation(
  previous: number[], next: number[], offset: number[], translation: number[], rotation: number[], scale: number[]
): number[] {
  const linear = new Matrix4().fromArray(rotation).multiply(new Matrix4().fromArray(scale));
  linear.setPosition(0, 0, 0);
  const oldPivot = new Vector3().fromArray(previous);
  const newPivot = new Vector3().fromArray(next);
  const oldOffset = new Vector3().fromArray(offset);
  const newOffset = newPivot.clone().negate();
  const oldLocalOrigin = oldPivot.add(oldOffset.applyMatrix4(linear));
  const newLocalOrigin = newPivot.add(newOffset.applyMatrix4(linear));
  const position = new Vector3().setFromMatrixPosition(new Matrix4().fromArray(translation));
  position.add(oldLocalOrigin).sub(newLocalOrigin);
  return new Matrix4().makeTranslation(position.x, position.y, position.z).toArray();
}
