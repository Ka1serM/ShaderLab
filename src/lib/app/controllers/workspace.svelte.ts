import type { EditorHost } from '../services/editor.svelte';
import type { CameraPose, ShaderDiagnostics, ShaderStage } from '../types';

const COMPILE_DELAY = 120;

type WorkspaceModel = {
  activeStage: ShaderStage;
  diagnostics: ShaderDiagnostics;
  camera: { pose: CameraPose; saved: boolean } | null;
};

export abstract class WorkspaceController<Model extends WorkspaceModel> {
  private compileTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(readonly model: Model, protected readonly editor: EditorHost) {}

  protected abstract get stages(): ShaderStage[] | undefined;
  protected abstract save(): void;

  setStage(stage: ShaderStage) {
    if (!this.stages?.includes(stage) || this.model.activeStage === stage) return;
    this.model.activeStage = stage;
    this.editor.show(stage);
    this.editor.setDiagnostics(this.model.diagnostics[stage]);
    this.save();
  }

  protected setCameraPose(pose: CameraPose) {
    const camera = this.model.camera;
    if (!this.stages || (camera?.saved && JSON.stringify(camera.pose) === JSON.stringify(pose))) return;
    this.model.camera = { pose, saved: true };
    this.save();
  }

  protected showDiagnostics(diagnostics: ShaderDiagnostics) {
    this.model.diagnostics = diagnostics;
    this.editor.setDiagnostics(diagnostics[this.model.activeStage]);
  }

  protected scheduleCompile(compile: () => void) {
    this.cancelCompile();
    this.compileTimer = setTimeout(() => { if (this.stages) compile(); }, COMPILE_DELAY);
  }

  protected cancelCompile() {
    clearTimeout(this.compileTimer);
  }
}
