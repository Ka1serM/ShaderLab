import type { ShaderReadbackRequest, ShaderReadbackType, ShaderReadbackValue } from '$lib/renderer/shaderReadback';
import type { ViewportOverlays, ViewportVector } from '$lib/renderer/Renderer';
import { controlValues, parseShaderControls } from '$lib/utils/shaderControls';
import { bindShaderTransforms } from '$lib/utils/shaderTransforms';
import { assembleShader, buildShaderProgram, prefixLines, type StageSources } from '../shaderProgram';
import { emptyDiagnostics, teachingShader, type CameraPose, type ShaderDiagnostics, type ShaderStage, type Teach, type TeachingControl, type TeachingValue } from '../types';

function readbackType(control: TeachingControl): ShaderReadbackType | undefined {
  if (control.type === 'slider') return 'float';
  if (control.type === 'vector3') return 'vector3';
  if (control.type === 'vector4') return 'vector4';
  if (control.type === 'matrix4') return 'matrix4';
  return undefined;
}

export class TeachingModel {
  definition = $state.raw<Teach | null>(null);
  overrides = $state.raw<Record<string, TeachingValue>>({});
  userCode = $state.raw<Partial<StageSources>>({});
  activeStage = $state<ShaderStage>('fragment');
  diagnostics = $state.raw<ShaderDiagnostics>(emptyDiagnostics());
  readbacks = $state.raw<Record<string, ShaderReadbackValue>>({});
  camera = $state.raw<{ pose: CameraPose; saved: boolean } | null>(null);
  selectedObject = $state(0);
  sceneIndex = $state(0);
  panelTab = $state<'parameters' | 'theory'>('parameters');

  readonly sources = $derived.by((): StageSources => {
    const definition = this.definition;
    if (!definition) return { vertex: '', fragment: '', compute: '' };
    const source = (stage: ShaderStage) => (definition.shaderStages.includes(stage) ? this.userCode[stage] : undefined) ?? teachingShader(definition, stage);
    return { vertex: source('vertex'), fragment: source('fragment'), compute: '' };
  });

  readonly program = $derived(buildShaderProgram(this.sources, {
    vertex: this.definition?.vertexShaderTemplate,
    fragment: this.definition?.fragmentShaderTemplate
  }));

  readonly annotations = $derived.by(() => {
    const definition = this.definition;
    const diagnostics = emptyDiagnostics();
    const controls: TeachingControl[] = [];
    if (!definition) return { controls, diagnostics };
    for (const stage of ['vertex', 'fragment'] as const) {
      const template = stage === 'vertex' ? definition.vertexShaderTemplate : definition.fragmentShaderTemplate;
      const parsed = parseShaderControls(assembleShader(this.sources[stage], template));
      controls.push(...parsed.controls.filter(control => !controls.some(existing => existing.id === control.id)));
      diagnostics[stage] = parsed.errors.map(({ line, message }) => ({ type: 'error', line: Math.max(1, line - prefixLines(template)), message }));
    }
    return { controls, diagnostics };
  });

  readonly controls = $derived(this.annotations.controls);

  readonly values = $derived<Record<string, TeachingValue>>({ ...controlValues(this.controls, this.overrides), ...this.readbacks });

  readonly readbackRequests = $derived<ShaderReadbackRequest[]>(this.controls.flatMap(control => {
    const type = readbackType(control);
    return control.readback && type ? [{ id: control.id, variable: control.readback, type }] : [];
  }));

  readonly uniformValues = $derived<Record<string, TeachingValue>>(Object.fromEntries(
    this.controls
      .filter(control => control.uniform)
      .map(control => [control.uniform as string, this.values[control.id]])
  ));

  readonly transforms = $derived(bindShaderTransforms(this.controls, this.values, this.selectedObject));

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
      visualization: control.visualization as ViewportVector['visualization'],
      editable: control.editable
    })));
}
