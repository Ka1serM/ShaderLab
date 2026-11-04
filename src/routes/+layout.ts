import { browser } from '$app/environment';
import { initGlslParser } from '$lib/glsl/parser';
import grammar from '$lib/glsl/tree-sitter-glsl.wasm?url';
import runtime from 'web-tree-sitter/tree-sitter.wasm?url';
import type { LayoutLoad } from './$types';

export const prerender = true;
export const trailingSlash = 'always';

const glslParser = browser ? initGlslParser(grammar, runtime) : undefined;

export const load: LayoutLoad = async ({ data }) => {
  await glslParser;
  return data;
};
