import { Matrix4, Quaternion, Vector3 } from 'three';
import type { TeachingControl, TeachingValue } from './shaderControls';
import type { TransformMode, ViewportTransform } from '../renderer/Renderer';

/** Shared annotation binding; no lesson IDs or uniform names are assumed. */
export function bindShaderTransforms(controls: TeachingControl[], values: Record<string, TeachingValue>) {
  const transforms = Object.fromEntries(controls.filter(control => control.transform).map(control => [control.transform, control])) as Partial<Record<TransformMode, TeachingControl>>;
  const modes = (['translate', 'rotate', 'scale'] as TransformMode[]).filter(role => transforms[role]);
  const pivotControl = controls.find(control => control.type === 'vector3' && control.uniform === transforms.translate?.pivot);
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
    }
  };
}
