import { createHash } from 'node:crypto';
import matter from 'gray-matter';
import { Marked, type Token, type Tokens } from 'marked';
import markedKatex from 'marked-katex-extension';
import type { ShaderTemplate, Task, Teach } from '$lib/app/types';
import { slugify } from '$lib/utils/slugify';
import type { CatalogEntry } from '$lib/catalog';
import taskIndex from '../../content/tasks/index.txt?raw';
import teachingIndex from '../../content/teaching/index.txt?raw';

const markdown = import.meta.glob<string>('/src/content/*/*.md', { query: '?raw', import: 'default', eager: true });

const marked = new Marked(markedKatex({ throwOnError: false, nonStandard: true }));

const TASK_SECTIONS = {
  'Task': 'task',
  'Theory': 'theory',
  'Hints': 'hints',
  'Starter Vertex Shader': 'starterVertexShader',
  'Starter Fragment Shader': 'starterFragmentShader',
  'Starter Compute Shader': 'starterComputeShader',
  'Reference Vertex Shader': 'referenceVertexShader',
  'Reference Fragment Shader': 'referenceFragmentShader',
  'Reference Compute Shader': 'referenceComputeShader'
} as const;

const TEACHING_SECTIONS = {
  'Overview': 'overview',
  'Explanation': 'explanation',
  'Vertex Shader': 'vertexShader',
  'Fragment Shader': 'fragmentShader'
} as const;

const PREFIX = '// @prefix';
const SUFFIX = '// @suffix';

class ContentError extends Error {
  constructor(file: string, message: string) {
    super(`${file}: ${message}`);
  }
}

function sections(file: string, tokens: Token[], names: Record<string, string>) {
  const result = new Map<string, Token[]>();
  let current: Token[] | undefined;
  for (const token of tokens) {
    if (token.type === 'heading' && token.depth === 1) {
      const key = names[token.text];
      if (!key) throw new ContentError(file, `unknown section "# ${token.text}". Known sections: ${Object.keys(names).join(', ')}.`);
      if (result.has(key)) throw new ContentError(file, `section "# ${token.text}" appears twice.`);
      current = [];
      result.set(key, current);
    } else if (current) {
      current.push(token);
    } else if (token.type !== 'space') {
      throw new ContentError(file, 'content before the first "# " section.');
    }
  }
  return result;
}

function html(tokens: Token[]) {
  return marked.parser(tokens);
}

function code(file: string, section: string, tokens: Token[]) {
  const blocks = tokens.filter((token): token is Tokens.Code => token.type === 'code');
  if (blocks.length !== 1 || blocks[0].lang !== 'glsl' || tokens.some(token => token.type !== 'code' && token.type !== 'space')) {
    throw new ContentError(file, `section "${section}" must contain exactly one \`\`\`glsl code block and nothing else.`);
  }
  return blocks[0].text;
}

function hints(tokens: Token[]) {
  const groups: Token[][] = [];
  for (const token of tokens) {
    if (token.type === 'heading' && token.depth === 2) groups.push([]);
    else if (groups.length) groups.at(-1)!.push(token);
    else if (token.type !== 'space') groups.push([token]);
  }
  return groups.map(html);
}

function splitTemplate(file: string, source: string): { source: string; template?: ShaderTemplate } {
  const lines = source.split('\n');
  const markers = (marker: string) => lines.flatMap((line, index) => (line.trim() === marker ? [index] : []));
  const prefix = markers(PREFIX);
  const suffix = markers(SUFFIX);
  if (![0, 2].includes(prefix.length) || ![0, 2].includes(suffix.length)) throw new ContentError(file, `${PREFIX} and ${SUFFIX} each come as a pair of lines.`);
  if (!prefix.length && !suffix.length) return { source };
  const [prefixStart, prefixEnd] = prefix.length ? prefix : [-1, -1];
  const [suffixStart, suffixEnd] = suffix.length ? suffix : [lines.length, lines.length];
  const text = (start: number, end: number) => lines.slice(start, end).join('\n').trim();
  return {
    source: text(prefixEnd + 1, suffixStart),
    template: { prefix: text(prefixStart + 1, prefixEnd), suffix: text(suffixStart + 1, suffixEnd) }
  };
}

const BLOCKS = new Set(['space', 'paragraph', 'heading', 'list_item', 'blockquote', 'table']);

function plainText(tokens: Token[]) {
  const text: string[] = [];
  marked.walkTokens(tokens, token => {
    if (BLOCKS.has(token.type)) text.push(' ');
    else if (token.type !== 'code' && !('tokens' in token && token.tokens?.length) && 'text' in token) text.push(token.text);
  });
  return text.join('').replace(/\s+/g, ' ').trim();
}

const plainTexts = new WeakMap<object, Record<string, string>>();

function parse(file: string, raw: string, names: Record<string, string>, editableShaders: readonly string[]) {
  const { data, content } = matter(raw);
  const result: Record<string, unknown> = { ...data };
  const text: Record<string, string> = {};
  plainTexts.set(result, text);
  for (const [key, tokens] of sections(file, marked.lexer(content), names)) {
    text[key] = plainText(tokens);
    if (key.endsWith('Shader')) {
      const shader = code(file, key, tokens);
      if (!editableShaders.includes(key)) {
        result[key] = shader;
        continue;
      }
      const { source, template } = splitTemplate(file, shader);
      result[key] = source;
      if (template) result[`${key}Template`] = template;
    } else {
      result[key] = key === 'hints' ? hints(tokens) : html(tokens);
    }
  }
  return result;
}

export function parseTask(file: string, raw: string): Task {
  return parse(file, raw, TASK_SECTIONS, ['starterVertexShader', 'starterFragmentShader', 'starterComputeShader']) as unknown as Task;
}

export function parseTeaching(file: string, raw: string): Teach {
  const result = parse(file, raw, TEACHING_SECTIONS, ['vertexShader', 'fragmentShader']);
  result.id = slugify(String(result.title));
  result.contentVersion = createHash('sha256').update(raw).digest('base64url').slice(0, 12);
  return result as unknown as Teach;
}

function contentFiles(kind: 'tasks' | 'teaching', index: string) {
  return index.split('\n')
    .map(name => name.trim())
    .filter(name => name && !name.startsWith('#'))
    .map(name => {
      const file = `src/content/${kind}/${name}`;
      const raw = markdown[`/${file}`];
      if (raw === undefined) throw new Error(`src/content/${kind}/index.txt lists ${name}, but the file does not exist.`);
      return { file, id: slugify(name.slice(0, -'.md'.length)), raw };
    });
}

function sectionText(content: object, section: string) {
  return plainTexts.get(content)?.[section] ?? '';
}

function preview(text: string, maxLength = 100) {
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

export const tasks = new Map(contentFiles('tasks', taskIndex).map(({ file, id, raw }) => [id, parseTask(file, raw)]));
export const teachings = new Map(contentFiles('teaching', teachingIndex).map(({ file, id, raw }) => [id, parseTeaching(file, raw)]));

export const taskCatalog: CatalogEntry[] = [...tasks].map(([id, task]) => ({
  id, title: task.title, category: task.category, description: preview(sectionText(task, 'task'))
}));

export const teachingCatalog: CatalogEntry[] = [...teachings].map(([id, teaching]) => ({
  id, title: teaching.title, category: teaching.category, description: preview(sectionText(teaching, 'overview'))
}));

export function taskSearchText(id: string) {
  const task = tasks.get(id)!;
  return [task.title, task.category ?? '', sectionText(task, 'task'), sectionText(task, 'theory')].join(' ').toLowerCase();
}

export function teachingSearchText(id: string) {
  const teaching = teachings.get(id)!;
  return [teaching.title, teaching.category ?? '', sectionText(teaching, 'overview')].join(' ').toLowerCase();
}
