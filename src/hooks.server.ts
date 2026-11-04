import { readFileSync } from 'node:fs';
import type { ServerInit } from '@sveltejs/kit';
import { initGlslParser } from '$lib/glsl/parser';

export const init: ServerInit = () => initGlslParser(readFileSync('src/lib/glsl/tree-sitter-glsl.wasm'));
