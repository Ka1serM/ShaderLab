import { emptyDiagnostics, type CameraPose, type ShaderDiagnostics, type ShaderStage, type Task } from '../types';
import type { StageSources } from '../shaderProgram';

export class TaskModel {
  slug = $state('');
  task = $state.raw<Task | null>(null);
  sources = $state<StageSources>({ vertex: '', fragment: '', compute: '' });
  activeStage = $state<ShaderStage>('fragment');
  diagnostics = $state.raw<ShaderDiagnostics>(emptyDiagnostics());
  camera = $state.raw<{ pose: CameraPose; saved: boolean } | null>(null);
  sceneIndex = $state(0);
  panelTab = $state<'task' | 'theory'>('task');
  openHints = $state<number[]>([]);
}
