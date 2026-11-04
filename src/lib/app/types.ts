import type { ShaderInput } from '$lib/renderer/gpu/inputs';
import type { Scene, ViewportOverlays } from '$lib/renderer/Renderer';
import { defaultCameraPose, type ViewportCameraPose } from '$lib/renderer/camera';
import type { ShaderDiagnostic, ShaderDiagnostics } from '$lib/renderer/gpu/program';
import type { TeachingValue } from '$lib/utils/shaderControls';

export type { ShaderDiagnostic, ShaderDiagnostics };
export type { TeachingControl, TeachingValue } from '$lib/utils/shaderControls';

export type ShaderStage = 'vertex' | 'fragment' | 'compute';

export interface ShaderTemplate {
  prefix: string;
  suffix: string;
}

export interface TaskCamera {
  position?: number[];
  quaternion?: number[];
  target?: number[];
  fov?: number;
}

export type CameraPose = ViewportCameraPose;

export interface Task {
  title: string;
  category?: string;
  task: string;
  theory: string;
  hints: string[];
  starterVertexShader?: string;
  starterFragmentShader?: string;
  starterVertexShaderTemplate?: ShaderTemplate;
  starterFragmentShaderTemplate?: ShaderTemplate;
  referenceVertexShader: string;
  referenceFragmentShader: string;
  starterComputeShader?: string;
  starterComputeShaderTemplate?: ShaderTemplate;
  referenceComputeShader?: string;
  simulation?: TaskSimulation;
  shaderStages: ShaderStage[];
  camera?: TaskCamera;
  inputs?: ShaderInput[];
  scenes: Scene[];
  overlays?: ViewportOverlays;
  showTimeControl?: boolean;
}

export interface TaskSimulation {
  stepsPerFrame?: number;
}

export interface TeachingPreset {
  name: string;
  values: Record<string, TeachingValue>;
}

export interface Teach {
  id: string;
  contentVersion: string;
  title: string;
  category?: string;
  presets?: TeachingPreset[];
  overview: string;
  explanation: string;
  shaderStages: ShaderStage[];
  vertexShader?: string;
  fragmentShader?: string;
  vertexShaderTemplate?: ShaderTemplate;
  fragmentShaderTemplate?: ShaderTemplate;
  inputs?: ShaderInput[];
  scenes: Scene[];
  overlays?: ViewportOverlays;
  showTimeControl?: boolean;
}

export const emptyDiagnostics = (): ShaderDiagnostics => ({ vertex: [], fragment: [], compute: [] });

export { defaultCameraPose };

export function taskCameraPose(task: Task): CameraPose {
  const camera = task.camera;
  const fallback = defaultCameraPose();
  return {
    position: (camera?.position?.length === 3 ? camera.position : fallback.position) as CameraPose['position'],
    quaternion: (camera?.quaternion?.length === 4 ? camera.quaternion : fallback.quaternion) as CameraPose['quaternion'],
    target: (camera?.target?.length === 3 ? camera.target : fallback.target) as CameraPose['target'],
    fov: camera?.fov ?? fallback.fov
  };
}

export function starterShader(task: Task, stage: ShaderStage): string {
  const reference = { vertex: task.referenceVertexShader, fragment: task.referenceFragmentShader, compute: task.referenceComputeShader ?? '' }[stage];
  if (!task.shaderStages.includes(stage)) return reference;
  return { vertex: task.starterVertexShader, fragment: task.starterFragmentShader, compute: task.starterComputeShader }[stage] ?? reference;
}

export const hasCompute = (task: Task) => task.referenceComputeShader !== undefined;

export function teachingShader(definition: Teach, stage: ShaderStage): string {
  return (stage === 'vertex' ? definition.vertexShader : stage === 'fragment' ? definition.fragmentShader : undefined) ?? '';
}
