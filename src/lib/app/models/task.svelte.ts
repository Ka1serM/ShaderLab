import { emptyDiagnostics, type CameraPose, type ShaderDiagnostics, type ShaderStage, type Task } from '../types';
import type { StageSources } from '../shaderProgram';

/** The open task. Only the TaskController writes these fields; views read them. */
export class TaskModel {
  slug = $state('');
  task = $state.raw<Task | null>(null);
  /** What runs in the output viewport. Stages students cannot edit hold the reference source. */
  sources = $state<StageSources>({ vertex: '', fragment: '', compute: '' });
  activeStage = $state<ShaderStage>('fragment');
  /** Errors of the last compile. They describe `sources` as compiled, never a stored copy. */
  diagnostics = $state.raw<ShaderDiagnostics>(emptyDiagnostics());
  camera = $state.raw<{ pose: CameraPose; saved: boolean } | null>(null);
  /** Reference and output always show the same scene. */
  sceneIndex = $state(0);
  panelTab = $state<'task' | 'theory'>('task');
  openHints = $state<number[]>([]);
}
