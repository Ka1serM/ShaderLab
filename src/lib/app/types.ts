import type { ShaderInput } from '$lib/renderer/ShaderTaskMaterial';
import type { Scene, ViewportOverlays } from '$lib/renderer/Renderer';
import type { ShaderDiagnostic, ShaderDiagnostics } from '$lib/renderer/shaderValidation';
import type { TeachingValue } from '$lib/utils/shaderControls';

export type { ShaderDiagnostic, ShaderDiagnostics };
export type { TeachingControl, TeachingValue } from '$lib/utils/shaderControls';

export type ShaderStage = 'vertex' | 'fragment';

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

export interface CameraPose {
  position: [number, number, number];
  quaternion: [number, number, number, number];
  target: [number, number, number];
  fov: number;
}

/** A task as parsed from its Markdown file at build time. Never mutated. */
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
  shaderStages: ShaderStage[];
  camera?: TaskCamera;
  inputs?: ShaderInput[];
  scenes: Scene[];
  overlays?: ViewportOverlays;
  showTimeControl?: boolean;
}

export interface TeachingPreset {
  name: string;
  values: Record<string, TeachingValue>;
}

/** A teaching demo as parsed from its Markdown file at build time. Never mutated. */
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

export const emptyDiagnostics = (): ShaderDiagnostics => ({ vertex: [], fragment: [] });

export const defaultCameraPose = (): CameraPose => ({ position: [0, 0, 1], quaternion: [0, 0, 0, 1], target: [0, 0, 0], fov: 30 });

export function taskCameraPose(task: Task): CameraPose {
  const camera = task.camera;
  return {
    position: (camera?.position?.length === 3 ? camera.position : [0, 0, 1]) as CameraPose['position'],
    quaternion: (camera?.quaternion?.length === 4 ? camera.quaternion : [0, 0, 0, 1]) as CameraPose['quaternion'],
    target: (camera?.target?.length === 3 ? camera.target : [0, 0, 0]) as CameraPose['target'],
    fov: camera?.fov ?? 30
  };
}

/** The code a stage starts with. Stages students cannot edit always run the reference source. */
export function starterShader(task: Task, stage: ShaderStage): string {
  if (!task.shaderStages.includes(stage)) return stage === 'vertex' ? task.referenceVertexShader : task.referenceFragmentShader;
  return (stage === 'vertex' ? task.starterVertexShader : task.starterFragmentShader) ?? '';
}
