import { CameraLink } from '$lib/renderer/CameraLink';
import type { RendererEvents } from '$lib/renderer/Renderer';
import { slugify } from '$lib/utils/slugify';
import { TaskModel } from '../models/task.svelte';
import { buildShaderProgram, type StageSources } from '../shaderProgram';
import { emptyDiagnostics, hasCompute, starterShader, taskCameraPose, type ShaderStage, type Task } from '../types';
import type { EditorHost } from '../services/editor.svelte';
import type { Persistence } from '../services/persistence';
import type { ViewportSlot } from './viewport.svelte';
import { SimulationController } from './simulation.svelte';
import { WorkspaceController } from './workspace.svelte';

export class TaskController extends WorkspaceController<TaskModel> {
  private readonly cameraLink = new CameraLink();
  readonly simulation: SimulationController;
  private storageSlug = '';

  constructor(
    private readonly persistence: Persistence,
    editor: EditorHost,
    private readonly reference: ViewportSlot,
    private readonly output: ViewportSlot
  ) {
    super(new TaskModel(), editor);
    this.simulation = new SimulationController([reference, output]);
  }

  protected get stages() {
    return this.model.task?.shaderStages;
  }

  open(slug: string, task: Task) {
    const model = this.model;
    if (model.slug === slug && model.task === task) return;
    this.storageSlug = slugify(task.title);
    const saved = this.persistence.taskWorkspace(this.storageSlug);
    const source = (stage: ShaderStage) => (task.shaderStages.includes(stage) ? saved?.userCode[stage] : undefined) ?? starterShader(task, stage);
    model.slug = slug;
    model.task = task;
    model.sources = { vertex: source('vertex'), fragment: source('fragment'), compute: source('compute') };
    model.activeStage = saved && task.shaderStages.includes(saved.activeTab) ? saved.activeTab : task.shaderStages[0] ?? 'fragment';
    model.diagnostics = emptyDiagnostics();
    model.camera = saved?.cameraPose ? { pose: saved.cameraPose, saved: true } : { pose: taskCameraPose(task), saved: false };
    model.sceneIndex = 0;
    model.panelTab = 'task';
    model.openHints = [];
    this.simulation.start(task.simulation?.stepsPerFrame);
    this.editor.open({
      key: `task:${slug}`,
      stages: task.shaderStages,
      initialText: { ...model.sources },
      onChange: (stage, text) => this.setSource(stage, text)
    }, model.activeStage);
    this.loadViewports();
  }

  close() {
    if (!this.model.task) return;
    this.cancelCompile();
    this.reference.release();
    this.output.release();
    this.model.slug = '';
    this.model.task = null;
  }

  setSource(stage: ShaderStage, text: string) {
    const model = this.model;
    if (!model.task?.shaderStages.includes(stage) || model.sources[stage] === text) return;
    model.sources[stage] = text;
    this.save();
    this.showDiagnostics(emptyDiagnostics());
    this.scheduleCompile(() => this.output.renderer?.updateShaders(this.outputShaders(this.model.task!)));
  }

  resetShader() {
    const model = this.model;
    if (model.task) this.editor.replaceText(model.activeStage, starterShader(model.task, model.activeStage));
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

  private outputShaders(task: Task) {
    const templates = { vertex: task.starterVertexShaderTemplate, fragment: task.starterFragmentShaderTemplate, compute: task.starterComputeShaderTemplate };
    return buildShaderProgram(this.model.sources, templates, hasCompute(task));
  }

  private loadViewports(fresh = true) {
    const model = this.model;
    const task = model.task!;
    this.cancelCompile();
    const reference = buildShaderProgram({ vertex: task.referenceVertexShader, fragment: task.referenceFragmentShader, compute: task.referenceComputeShader ?? '' }, {}, hasCompute(task));
    const shared = { inputs: task.inputs ?? [], overlays: task.overlays, scene: task.scenes[model.sceneIndex]!, simulation: hasCompute(task) ? this.simulation.settings : undefined };
    const onCameraChange: RendererEvents['onCameraChange'] = pose => this.setCameraPose(pose);
    this.reference.load({ ...shared, ...reference }, model.camera!, { onCameraChange }, this.cameraLink, fresh);
    this.output.load({ ...shared, ...this.outputShaders(task) }, model.camera!, { onCameraChange, onShaderErrors: diagnostics => this.showDiagnostics(diagnostics) }, this.cameraLink, fresh);
  }

  protected save() {
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
