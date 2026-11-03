import type { RendererEvents, ViewportTransform } from '$lib/renderer/Renderer';
import type { ShaderReadbackValue } from '$lib/renderer/shaderReadback';
import { TeachingModel } from '../models/teaching.svelte';
import { defaultCameraPose, emptyDiagnostics, type CameraPose, type ShaderStage, type Teach, type TeachingValue } from '../types';
import type { EditorHost } from '../services/editor.svelte';
import type { Persistence } from '../services/persistence';
import type { ViewportSlot } from './viewport.svelte';

const COMPILE_DELAY = 120;

function sameReadback(previous: ShaderReadbackValue | undefined, next: ShaderReadbackValue) {
  if (!Array.isArray(previous) || !Array.isArray(next)) return previous === next;
  return previous.length === next.length && next.every((component, index) => component === previous[index]);
}

/**
 * Opens teaching demos and applies every change to them. After each change it
 * pushes the derived uniforms, gizmo and vectors to the viewport in one place.
 */
export class TeachingController {
  readonly model = new TeachingModel();
  private compileTimer: ReturnType<typeof setTimeout> | undefined;
  /** The overlays the viewport was loaded with. Different overlays need a full reload. */
  private loadedOverlays = '';

  constructor(
    private readonly persistence: Persistence,
    private readonly editor: EditorHost,
    private readonly viewport: ViewportSlot
  ) {}

  open(definition: Teach) {
    const model = this.model;
    if (model.definition === definition) return;
    const saved = this.persistence.teachingWorkspace(definition.id, definition.contentVersion);
    model.definition = definition;
    model.overrides = { ...saved?.parameters };
    model.userCode = { ...saved?.userCode };
    model.activeStage = definition.shaderStages.includes('fragment') ? 'fragment' : definition.shaderStages[0] ?? 'fragment';
    model.diagnostics = emptyDiagnostics();
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
    this.load();
  }

  close() {
    if (!this.model.definition) return;
    clearTimeout(this.compileTimer);
    this.viewport.release();
    this.model.definition = null;
  }

  setSource(stage: ShaderStage, text: string) {
    const model = this.model;
    const definition = model.definition;
    if (!definition || !definition.shaderStages.includes(stage) || model.sources[stage] === text) return;
    const starter = (stage === 'vertex' ? definition.vertexShader : definition.fragmentShader) ?? '';
    const userCode = { ...model.userCode };
    if (text === starter) delete userCode[stage];
    else userCode[stage] = text;
    model.userCode = userCode;
    model.readbacks = {};
    this.showDiagnostics(emptyDiagnostics());
    this.save();
    if (JSON.stringify(model.overlays ?? {}) !== this.loadedOverlays) {
      this.load(false);
      return;
    }
    this.sync();
    clearTimeout(this.compileTimer);
    this.compileTimer = setTimeout(() => {
      if (!this.model.definition) return;
      const program = this.model.program;
      this.viewport.renderer?.updateShaders(program.vertex, program.fragment, this.model.readbackRequests);
    }, COMPILE_DELAY);
  }

  setStage(stage: ShaderStage) {
    const model = this.model;
    if (!model.definition || model.activeStage === stage || !model.definition.shaderStages.includes(stage)) return;
    model.activeStage = stage;
    this.editor.show(stage);
    this.editor.setDiagnostics(model.diagnostics[stage]);
  }

  resetShader() {
    const definition = this.model.definition;
    if (!definition) return;
    const stage = this.model.activeStage;
    this.editor.replaceText(stage, (stage === 'vertex' ? definition.vertexShader : definition.fragmentShader) ?? '');
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

  /** Drops every override, so each control falls back to the default in its @control annotation. */
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
    const previous = this.model.readbacks;
    const ids = Object.keys(values);
    if (ids.length === Object.keys(previous).length && ids.every(id => sameReadback(previous[id], values[id]))) return;
    this.model.readbacks = values;
    this.sync();
  }

  private setCameraPose(pose: CameraPose) {
    const camera = this.model.camera;
    if (!this.model.definition || (camera?.saved && JSON.stringify(camera.pose) === JSON.stringify(pose))) return;
    this.model.camera = { pose, saved: true };
    this.save();
  }

  private showDiagnostics(diagnostics: typeof this.model.diagnostics) {
    this.model.diagnostics = diagnostics;
    this.editor.setDiagnostics(diagnostics[this.model.activeStage]);
  }

  /** Loads the whole demo into the viewport. */
  private load(fresh = true) {
    const model = this.model;
    const definition = model.definition!;
    clearTimeout(this.compileTimer);
    this.loadedOverlays = JSON.stringify(model.overlays ?? {});
    const program = model.program;
    const events: RendererEvents = {
      onCameraChange: pose => this.setCameraPose(pose),
      onShaderErrors: diagnostics => this.showDiagnostics(diagnostics),
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
      vertexShader: program.vertex,
      fragmentShader: program.fragment,
      shaderLineOffsets: program.lineOffsets,
      shaderReadbacks: model.readbackRequests
    }, model.camera!, events, undefined, fresh);
    this.sync();
  }

  /** Pushes every value derived from the model to the viewport. */
  private sync() {
    const renderer = this.viewport.renderer;
    if (!renderer || !this.model.definition) return;
    renderer.setUniformValues(this.model.uniformValues);
    renderer.setTransformState(this.model.transforms.state);
    renderer.setVectorVisualizations(this.model.vectors);
  }

  private save() {
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
