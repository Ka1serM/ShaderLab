import { CameraLink } from '$lib/renderer/CameraLink';
import type { RendererEvents } from '$lib/renderer/Renderer';
import { slugify } from '$lib/utils/slugify';
import { TaskModel } from '../models/task.svelte';
import { buildShaderProgram, type ShaderProgram, type StageSources } from '../shaderProgram';
import { emptyDiagnostics, starterShader, taskCameraPose, type CameraPose, type ShaderStage, type Task } from '../types';
import type { EditorHost } from '../services/editor.svelte';
import type { Persistence } from '../services/persistence';
import type { ViewportSlot } from './viewport.svelte';
import { SimulationController } from './simulation.svelte';

const COMPILE_DELAY = 120;

/**
 * Opens tasks and applies every change to them. The model is the only state;
 * the editor, the viewports and storage are updated from here, never from views.
 */
export class TaskController {
  readonly model = new TaskModel();
  /** Reference and output show one camera. */
  private readonly cameraLink = new CameraLink();
  /** The compute stage of both viewports, for tasks that have one. */
  readonly simulation: SimulationController;
  private compileTimer: ReturnType<typeof setTimeout> | undefined;
  private storageSlug = '';

  constructor(
    private readonly persistence: Persistence,
    private readonly editor: EditorHost,
    private readonly reference: ViewportSlot,
    private readonly output: ViewportSlot
  ) {
    this.simulation = new SimulationController([reference, output]);
  }

  /** Shows `task` with the saved workspace for it. Opening the open task again changes nothing. */
  open(slug: string, task: Task) {
    const model = this.model;
    if (model.slug === slug && model.task === task) return;
    this.storageSlug = slugify(task.title);
    const saved = this.persistence.taskWorkspace(this.storageSlug);
    const sources: StageSources = { vertex: '', fragment: '', compute: '' };
    for (const stage of ['vertex', 'fragment', 'compute'] as const) {
      sources[stage] = task.shaderStages.includes(stage) ? saved?.userCode[stage] ?? starterShader(task, stage) : starterShader(task, stage);
    }
    model.slug = slug;
    model.task = task;
    model.sources = sources;
    model.activeStage = saved && task.shaderStages.includes(saved.activeTab) ? saved.activeTab : task.shaderStages[0] ?? 'fragment';
    model.diagnostics = emptyDiagnostics();
    model.camera = saved?.cameraPose ? { pose: saved.cameraPose, saved: true } : { pose: taskCameraPose(task), saved: false };
    model.sceneIndex = 0;
    model.panelTab = 'task';
    model.openHints = [];
    this.simulation.start(task.simulation?.stepsPerFrame);
    this.openEditor();
    this.loadViewports();
  }

  /** Leaves the task page. Pending work is saved, and the viewports stop reporting here. */
  close() {
    if (!this.model.task) return;
    clearTimeout(this.compileTimer);
    this.reference.release();
    this.output.release();
    this.model.slug = '';
    this.model.task = null;
  }

  setSource(stage: ShaderStage, text: string) {
    const model = this.model;
    if (!model.task || !model.task.shaderStages.includes(stage) || model.sources[stage] === text) return;
    model.sources[stage] = text;
    this.save();
    this.scheduleCompile();
  }

  setStage(stage: ShaderStage) {
    const model = this.model;
    if (!model.task || model.activeStage === stage || !model.task.shaderStages.includes(stage)) return;
    model.activeStage = stage;
    this.editor.show(stage);
    this.editor.setDiagnostics(model.diagnostics[stage]);
    this.save();
  }

  /** Restores the starter code of the shown stage. The edit can be undone in the editor. */
  resetShader() {
    const model = this.model;
    if (!model.task) return;
    this.editor.replaceText(model.activeStage, starterShader(model.task, model.activeStage));
  }

  selectScene(index: number) {
    const model = this.model;
    if (!model.task || index === model.sceneIndex || index < 0 || index >= model.task.scenes.length) return;
    model.sceneIndex = index;
    this.loadViewports(false);
  }

  setPanelTab(tab: 'task' | 'theory') {
    this.model.panelTab = tab;
  }

  toggleHint(index: number, open: boolean) {
    const hints = this.model.openHints.filter(hint => hint !== index);
    this.model.openHints = open ? [...hints, index] : hints;
  }

  private setCameraPose(pose: CameraPose) {
    const camera = this.model.camera;
    if (!this.model.task || (camera?.saved && JSON.stringify(camera.pose) === JSON.stringify(pose))) return;
    this.model.camera = { pose, saved: true };
    this.save();
  }

  private openEditor() {
    const model = this.model;
    const task = model.task!;
    this.editor.open({
      key: `task:${model.slug}`,
      stages: task.shaderStages,
      initialText: { ...model.sources },
      onChange: (stage, text) => this.setSource(stage, text)
    }, model.activeStage);
  }

  private templates(task: Task) {
    return { vertex: task.starterVertexShaderTemplate, fragment: task.starterFragmentShaderTemplate, compute: task.starterComputeShaderTemplate };
  }

  /** The compute stage as the renderer takes it, for tasks that have one. */
  private computeShader(task: Task, program: ShaderProgram) {
    return task.referenceComputeShader === undefined ? undefined : { source: program.compute, lineOffset: program.lineOffsets.compute };
  }

  private loadViewports(fresh = true) {
    const model = this.model;
    const task = model.task!;
    clearTimeout(this.compileTimer);
    const camera = model.camera!;
    const scene = task.scenes[model.sceneIndex]!;
    const onCameraChange = (pose: CameraPose) => this.setCameraPose(pose);
    const reference = buildShaderProgram({ vertex: task.referenceVertexShader, fragment: task.referenceFragmentShader, compute: task.referenceComputeShader ?? '' });
    const output = buildShaderProgram(model.sources, this.templates(task));
    const simulation = task.referenceComputeShader === undefined ? undefined : this.simulation.settings;
    const shared = { inputs: task.inputs ?? [], overlays: task.overlays, scene, shaderReadbacks: [], simulation };
    const referenceEvents: RendererEvents = { onCameraChange };
    const outputEvents: RendererEvents = { onCameraChange, onShaderErrors: diagnostics => this.showDiagnostics(diagnostics) };
    this.reference.load({ ...shared, vertexShader: reference.vertex, fragmentShader: reference.fragment, computeShader: this.computeShader(task, reference), shaderLineOffsets: reference.lineOffsets }, camera, referenceEvents, this.cameraLink, fresh);
    this.output.load({ ...shared, vertexShader: output.vertex, fragmentShader: output.fragment, computeShader: this.computeShader(task, output), shaderLineOffsets: output.lineOffsets }, camera, outputEvents, this.cameraLink, fresh);
  }

  /** Compiles shortly after typing stops. Until then the previous errors no longer apply. */
  private scheduleCompile() {
    this.showDiagnostics(emptyDiagnostics());
    clearTimeout(this.compileTimer);
    this.compileTimer = setTimeout(() => {
      const task = this.model.task;
      if (!task) return;
      const program = buildShaderProgram(this.model.sources, this.templates(task));
      this.output.renderer?.updateShaders(program.vertex, program.fragment, [], this.computeShader(task, program));
    }, COMPILE_DELAY);
  }

  private showDiagnostics(diagnostics: typeof this.model.diagnostics) {
    this.model.diagnostics = diagnostics;
    this.editor.setDiagnostics(diagnostics[this.model.activeStage]);
  }

  private save() {
    const model = this.model;
    const task = model.task;
    if (!task) return;
    const userCode: Partial<StageSources> = {};
    for (const stage of task.shaderStages) {
      if (model.sources[stage] !== starterShader(task, stage)) userCode[stage] = model.sources[stage];
    }
    this.persistence.saveTaskWorkspace({
      taskSlug: this.storageSlug,
      userCode,
      activeTab: model.activeStage,
      cameraPose: model.camera?.saved ? model.camera.pose : undefined
    });
  }
}
