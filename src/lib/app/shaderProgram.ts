import type { RendererShaders } from '$lib/renderer/Renderer';
import type { ShaderStage, ShaderTemplate } from './types';

export type StageSources = Record<ShaderStage, string>;
export type StageTemplates = Partial<Record<ShaderStage, ShaderTemplate | undefined>>;

export function assembleShader(source: string, template?: ShaderTemplate) {
  if (!template) return source;
  return [template.prefix, source, template.suffix].filter(Boolean).join('\n');
}

export const prefixLines = (template?: ShaderTemplate) => template?.prefix ? template.prefix.split('\n').length : 0;

export function buildShaderProgram(sources: StageSources, templates: StageTemplates = {}, compute = false): RendererShaders {
  const build = (stage: ShaderStage) => assembleShader(sources[stage], templates[stage]);
  return {
    vertexShader: build('vertex'),
    fragmentShader: build('fragment'),
    computeShader: compute ? build('compute') : undefined,
    lineOffsets: { vertex: prefixLines(templates.vertex), fragment: prefixLines(templates.fragment), compute: prefixLines(templates.compute) }
  };
}
