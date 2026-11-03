import type { ShaderReadbackRequest, ShaderReadbackType, ShaderReadbackValue } from '$lib/renderer/shaderReadback';
import type { ViewportOverlays, ViewportVector } from '$lib/renderer/Renderer';
import { controlValues, parseShaderControls } from '$lib/utils/shaderControls';
import { bindShaderTransforms } from '$lib/utils/shaderTransforms';
import { buildShaderProgram, type StageSources } from '../shaderProgram';
import { emptyDiagnostics, type CameraPose, type ShaderDiagnostics, type ShaderStage, type Teach, type TeachingControl, type TeachingValue } from '../types';

type UniformValue = number | number[] | boolean;

function readbackType(control: TeachingControl): ShaderReadbackType | undefined {
  if (control.type === 'slider') return 'float';
  if (control.type === 'vector3') return 'vector3';
  if (control.type === 'vector4') return 'vector4';
  if (control.type === 'matrix4') return 'matrix4';
  return undefined;
}

function colorToVec3(value: string | number[]): number[] {
  if (Array.isArray(value)) return value;
  const hex = value.replace('#', '');
  return [0, 1, 2].map(index => parseInt(hex.slice(index * 2, index * 2 + 2), 16) / 255);
}

function uniformValue(control: TeachingControl, value: TeachingValue): UniformValue | undefined {
  if (control.type === 'color') return colorToVec3(value as string | number[]);
  return typeof value === 'string' ? undefined : value;
}

/**
 * The open teaching demo. The TeachingController writes the `$state` fields;
 * everything else derives from them, so controls, uniforms and the gizmo
 * always describe the code in the editor.
 */
export class TeachingModel {
  definition = $state.raw<Teach | null>(null);
  /** Overrides only: a control without an entry shows the default from its @control annotation. */
  overrides = $state.raw<Record<string, TeachingValue>>({});
  userCode = $state.raw<Partial<StageSources>>({});
  activeStage = $state<ShaderStage>('fragment');
  diagnostics = $state.raw<ShaderDiagnostics>(emptyDiagnostics());
  /** Values the shader computed, by control id. They describe the last compiled program. */
  readbacks = $state.raw<Record<string, ShaderReadbackValue>>({});
  camera = $state.raw<{ pose: CameraPose; saved: boolean } | null>(null);
  /** The object that the last click selected. The gizmo edits its transform controls. */
  selectedObject = $state(0);
  sceneIndex = $state(0);
  panelTab = $state<'parameters' | 'theory'>('parameters');

  readonly sources = $derived.by((): StageSources => {
    const definition = this.definition;
    const source = (stage: ShaderStage) => {
      const fallback = (stage === 'vertex' ? definition?.vertexShader : definition?.fragmentShader) ?? '';
      return definition?.shaderStages.includes(stage) ? this.userCode[stage] ?? fallback : fallback;
    };
    return { vertex: source('vertex'), fragment: source('fragment'), compute: '' };
  });

  readonly program = $derived(buildShaderProgram(this.sources, {
    vertex: this.definition?.vertexShaderTemplate,
    fragment: this.definition?.fragmentShaderTemplate
  }));

  readonly controls = $derived.by(() => {
    const definition = this.definition;
    if (!definition) return [] as TeachingControl[];
    // Annotations are read from the assembled code, so a template can declare controls too.
    const assemble = (source: string, template?: { prefix: string; suffix: string }) =>
      template ? [template.prefix, source, template.suffix].filter(Boolean).join('\n') : source;
    return parseShaderControls(`${assemble(this.sources.vertex, definition.vertexShaderTemplate)}\n${assemble(this.sources.fragment, definition.fragmentShaderTemplate)}`);
  });

  /** What every control shows: overrides, defaults, and values read back from the shader. */
  readonly values = $derived<Record<string, TeachingValue>>({ ...controlValues(this.controls, this.overrides), ...this.readbacks });

  readonly readbackRequests = $derived<ShaderReadbackRequest[]>(this.controls.flatMap(control => {
    const type = readbackType(control);
    return control.readback && type ? [{ id: control.id, variable: control.readback, type }] : [];
  }));

  readonly uniformValues = $derived<Record<string, UniformValue>>(Object.fromEntries(
    this.controls
      .filter(control => control.uniform)
      .map(control => [control.uniform as string, uniformValue(control, this.values[control.id])])
      .filter((entry): entry is [string, UniformValue] => entry[1] !== undefined)
  ));

  readonly transforms = $derived(bindShaderTransforms(this.controls, this.values, this.selectedObject));

  /** Transform controls enable the gizmo. A demo can also enable it with `overlays.transformControls`. */
  readonly overlays = $derived.by((): ViewportOverlays | undefined => {
    const overlays = this.definition?.overlays;
    return this.controls.some(control => control.transform) && !overlays?.transformControls
      ? { ...overlays, transformControls: {} }
      : overlays;
  });

  readonly vectors = $derived<ViewportVector[]>(this.controls
    .filter(control => control.type === 'vector3' && control.visualization)
    .map(control => ({
      id: control.id,
      value: this.values[control.id] as ViewportVector['value'],
      origin: control.visualizationOrigin,
      visualization: control.visualization as ViewportVector['visualization'],
      editable: control.editable,
      target: control.target,
      inverse: control.inverse ? this.values[control.inverse] as number[] | undefined : undefined
    })));
}
