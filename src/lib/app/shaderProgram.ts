import { rewriteRowMajorMatrixLiterals } from '$lib/utils/glslMatrixLiterals';
import type { ShaderStage, ShaderTemplate } from './types';

export type StageSources = Record<ShaderStage, string>;
export type StageTemplates = Partial<Record<ShaderStage, ShaderTemplate | undefined>>;

/** The GPU-ready sources of one viewport, and how many hidden lines precede the editable code. */
export type ShaderProgram = {
  vertex: string;
  fragment: string;
  compute: string;
  lineOffsets: Record<ShaderStage, number>;
};

export function assembleShader(source: string, template?: ShaderTemplate) {
  if (!template) return source;
  return [template.prefix, source, template.suffix].filter(Boolean).join('\n');
}

function prefixLines(template?: ShaderTemplate) {
  return template?.prefix ? template.prefix.split('\n').length : 0;
}

/**
 * Wraps editable code in its hidden template. Every shader that reaches the GPU,
 * reference and student alike, goes through the row-major literal rewrite, so
 * mat3/mat4 literals read in ordinary row order throughout the course.
 */
export function buildShaderProgram(sources: StageSources, templates: StageTemplates = {}): ShaderProgram {
  return {
    vertex: rewriteRowMajorMatrixLiterals(assembleShader(sources.vertex, templates.vertex)),
    fragment: rewriteRowMajorMatrixLiterals(assembleShader(sources.fragment, templates.fragment)),
    compute: rewriteRowMajorMatrixLiterals(assembleShader(sources.compute, templates.compute)),
    lineOffsets: { vertex: prefixLines(templates.vertex), fragment: prefixLines(templates.fragment), compute: prefixLines(templates.compute) }
  };
}
