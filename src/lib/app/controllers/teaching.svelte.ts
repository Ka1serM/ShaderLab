import type { RendererEvents, ViewportTransform } from '$lib/renderer/Renderer';
import type { ShaderReadbackValue } from '$lib/renderer/shaderReadback';
import { sameValues } from '$lib/utils/sameValues';
import { TeachingModel } from '../models/teaching.svelte';
import { defaultCameraPose, teachingShader, type ShaderDiagnostics, type ShaderStage, type Teach, type TeachingValue } from '../types';
import type { EditorHost } from '../services/editor.svelte';
import type { Persistence } from '../services/persistence';
import type { ViewportSlot } from './viewport.svelte';
import { WorkspaceController } from './workspace.svelte';

export class TeachingController extends WorkspaceController<TeachingModel> {
  private loadedOverlays = '';

  constructor(
    private readonly persistence: Persistence,
    editor: EditorHost,
    private readonly viewport: ViewportSlot
  ) {
    super(new TeachingModel(), editor);
  }

  protected get stages() {
    return this.model.definition?.shaderStages;
  }

  open(definition: Teach) {
    const model = this.model;
    if (model.definition === definition) return;
    const saved = this.persistence.teachingWorkspace(definition.id, definition.contentVersion);
    model.definition = definition;
    model.overrides = { ...saved?.parameters };
    model.userCode = { ...saved?.userCode };
    model.activeStage = definition.shaderStages.includes('fragment') ? 'fragment' : definition.shaderStages[0] ?? 'fragment';
    model.readbacks = {};
    model.camera = saved?.cameraPose ? { pose: saved.cameraPose, saved: true } : { pose: defaultCameraPose(), saved: false };
    model.selectedObject = 0;
    model.sceneIndex = 0;
    model.panelTab = 'parameters';
    this.editor.open({
      key: `teach:${definition.id}`,
      stages: definition.shaderStages,
      initialText: { vertex: model.sources.vertex, fragment: model.sources.fragment },
      onChange: (stage, text) => this.setSource(stage, text)
    }, model.activeStage);
    this.showDiagnostics(model.annotations.diagnostics);
    this.load();
  }

  close() {
    if (!this.model.definition) return;
    this.cancelCompile();
    this.viewport.release();
    this.model.definition = null;
  }

  setSource(stage: ShaderStage, text: string) {
    const model = this.model;
    const definition = model.definition;
    if (!definition || !definition.shaderStages.includes(stage) || model.sources[stage] === text) return;
    const userCode = { ...model.userCode };
    if (text === teachingShader(definition, stage)) delete userCode[stage];
    else userCode[stage] = text;
    model.userCode = userCode;
    model.readbacks = {};
    this.showDiagnostics(model.annotations.diagnostics);
    this.save();
    if (JSON.stringify(model.overlays ?? {}) !== this.loadedOverlays) {
      this.load(false);
      return;
    }
    this.sync();
    this.scheduleCompile(() => this.viewport.renderer?.updateShaders({ ...this.model.program, shaderReadbacks: this.model.readbackRequests }));
  }

  resetShader() {
    const definition = this.model.definition;
    if (definition) this.editor.replaceText(this.model.activeStage, teachingShader(definition, this.model.activeStage));
  }

  setValue(id: string, value: TeachingValue) {
    this.setOverrides({ ...this.model.overrides, [id]: value });
  }

  setValues(values: Record<string, TeachingValue>) {
    this.setOverrides({ ...this.model.overrides, ...values });
  }

  resetValue(id: string) {
    if (!(id in this.model.overrides)) return;
    const overrides = { ...this.model.overrides };
    delete overrides[id];
    this.setOverrides(overrides);
  }

  resetValues() {
    this.setOverrides({});
  }

  applyPreset(values: Record<string, TeachingValue>) {
    this.setOverrides({ ...values });
  }

  selectScene(index: number) {
    const model = this.model;
    if (!model.definition || index === model.sceneIndex || index < 0 || index >= model.definition.scenes.length) return;
    model.sceneIndex = index;
    this.load(false);
  }

  setPanelTab(tab: 'parameters' | 'theory') {
    this.model.panelTab = tab;
  }

  private setOverrides(overrides: Record<string, TeachingValue>) {
    if (!this.model.definition) return;
    this.model.overrides = overrides;
    this.save();
    this.sync();
  }

  private applyTransform(transform: ViewportTransform) {
    const updates = this.model.transforms.transformUpdates(transform);
    if (Object.keys(updates).length) this.setValues(updates);
  }

  private selectObject(index: number | undefined) {
    if (index === undefined || index === this.model.selectedObject) return;
    this.model.selectedObject = index;
    this.sync();
  }

  private applyReadbacks(values: Record<string, ShaderReadbackValue>) {
    if (sameValues(this.model.readbacks, values)) return;
    this.model.readbacks = values;
    this.sync();
  }

  private withAnnotations(diagnostics: ShaderDiagnostics): ShaderDiagnostics {
    const annotations = this.model.annotations.diagnostics;
    return {
      vertex: [...annotations.vertex, ...diagnostics.vertex],
      fragment: [...annotations.fragment, ...diagnostics.fragment],
      compute: diagnostics.compute
    };
  }

  private load(fresh = true) {
    const model = this.model;
    const definition = model.definition!;
    this.cancelCompile();
    this.loadedOverlays = JSON.stringify(model.overlays ?? {});
    const events: RendererEvents = {
      onCameraChange: pose => this.setCameraPose(pose),
      onShaderErrors: diagnostics => this.showDiagnostics(this.withAnnotations(diagnostics)),
      onShaderReadbacks: values => this.applyReadbacks(values),
      onTransformChange: transform => this.applyTransform(transform),
      onObjectSelect: index => this.selectObject(index),
      onVectorChange: (id, value) => this.setValue(id, value)
    };
    this.viewport.load({
      inputs: definition.inputs ?? [],
      uniformValues: model.uniformValues,
      overlays: model.overlays,
      scene: definition.scenes[model.sceneIndex]!,
      ...model.program,
      shaderReadbacks: model.readbackRequests
    }, model.camera!, events, undefined, fresh);
    this.sync();
  }

  private sync() {
    const renderer = this.viewport.renderer;
    if (!renderer || !this.model.definition) return;
    renderer.setUniformValues(this.model.uniformValues);
    renderer.setTransformState(this.model.transforms.state);
    renderer.setVectorVisualizations(this.model.vectors);
  }

  protected save() {
    const model = this.model;
    const definition = model.definition;
    if (!definition) return;
    this.persistence.saveTeachingWorkspace(definition.id, definition.contentVersion, {
      userCode: model.userCode,
      parameters: model.overrides,
      cameraPose: model.camera?.saved ? model.camera.pose : undefined
    });
  }
}
