// js-yaml is browser-safe but does not ship TypeScript declarations.
// @ts-expect-error
import yaml from 'js-yaml';
import { marked } from 'marked';
import katex from 'katex';
// sanitize-html does not ship TypeScript declarations.
// @ts-expect-error
import sanitizeHtml from 'sanitize-html';
import type { Task } from '$lib/stores/taskStore';
import type { Teach } from '$lib/stores/teachingStore';
import { slugify } from '$lib/utils/slugify';

type RawModules = Record<string, string>;
const taskFiles = import.meta.glob('/src/lib/data/tasks/*.md', { eager: true, query: '?raw', import: 'default' }) as RawModules;
const teachingFiles = import.meta.glob('/src/lib/data/teaching/*.md', { eager: true, query: '?raw', import: 'default' }) as RawModules;

function camelCase(value: string) {
  return value.replace(/\s(.)/g, (_, char) => char.toUpperCase()).replace(/\s/g, '').replace(/^(.)/, (_, char) => char.toLowerCase());
}

function frontmatter(raw: string) {
  const match = raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
  if (!match) return { data: {}, content: raw };
  return { data: (yaml.load(match[1]) ?? {}) as Record<string, unknown>, content: raw.slice(match[0].length) };
}

function shader(source: string) {
  return source.replace(/^```(?:glsl)?\s*/i, '').replace(/```\s*$/, '').trim();
}

function splitStudentShader(source: string) {
  const prefixMarkers = [...source.matchAll(/^\s*\/\/\s*@prefix\s*$/gm)];
  const suffixMarkers = [...source.matchAll(/^\s*\/\/\s*@suffix\s*$/gm)];
  if (![0, 2].includes(prefixMarkers.length) || ![0, 2].includes(suffixMarkers.length)) throw new Error('A starter shader needs paired @prefix/@suffix markers.');
  if (!prefixMarkers.length && !suffixMarkers.length) return { source, template: undefined };
  const [prefixStart, prefixEnd] = prefixMarkers;
  const [suffixStart, suffixEnd] = suffixMarkers;
  const studentStart = prefixEnd ? (prefixEnd.index ?? 0) + prefixEnd[0].length : 0;
  const studentEnd = suffixStart?.index ?? source.length;
  const suffixSourceStart = suffixStart ? (suffixStart.index ?? 0) + suffixStart[0].length : source.length;
  return {
    source: source.slice(studentStart, studentEnd).trim(),
    template: {
      prefix: prefixStart && prefixEnd ? source.slice((prefixStart.index ?? 0) + prefixStart[0].length, prefixEnd.index ?? 0).trim() : '',
      suffix: suffixStart && suffixEnd ? source.slice(suffixSourceStart, suffixEnd.index ?? source.length).trim() : ''
    }
  };
}

function html(value: string, math = false) {
  if (!value.trim()) return '';
  const rendered = math ? value
    .replace(/\$\$(.+?)\$\$/gs, (_, expression) => katex.renderToString(expression, { displayMode: true, throwOnError: false }))
    .replace(/\$(.+?)\$/g, (_, expression) => katex.renderToString(expression, { throwOnError: false }))
    : value;
  return sanitizeHtml(marked.parse(rendered) as string, { allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'math', 'semantics', 'annotation', 'mrow', 'mi', 'mo', 'mn', 'msup', 'mfrac']), allowedAttributes: { ...sanitizeHtml.defaults.allowedAttributes, '*': ['class', 'aria-hidden'], span: ['class', 'style', 'aria-hidden'], annotation: ['encoding'] } });
}

function sections(content: string) {
  const result: Record<string, string> = {};
  let key = ''; let lines: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^#\s+(.*)$/);
    if (match) { if (key) result[key] = lines.join('\n').trim(); key = match[1].trim(); lines = []; }
    else lines.push(line);
  }
  if (key) result[key] = lines.join('\n').trim();
  return result;
}

function hints(value: string) {
  const matches = [...value.matchAll(/^##\s+Hint(?:\s+\d+)?\s*$/gim)];
  if (!matches.length) return value.trim() ? [html(value, true)] : [];
  return matches.map((match, index) => {
    const start = value.indexOf('\n', match.index ?? 0) + 1;
    const end = index + 1 < matches.length ? matches[index + 1].index : value.length;
    return html(value.slice(start, end).trim(), true);
  });
}

function parseTask(raw: string) {
  const parsed = frontmatter(raw); const result: Record<string, unknown> = Object.fromEntries(Object.entries(parsed.data).map(([key, value]) => [camelCase(key), value]));
  for (const [key, value] of Object.entries(sections(parsed.content))) {
    const name = camelCase(key);
    if (/shader/i.test(key)) {
      const source = shader(value);
      if (name.startsWith('starter')) { const split = splitStudentShader(source); result[name] = split.source; if (split.template) result[`${name}Template`] = split.template; }
      else result[name] = source;
    } else result[name] = name === 'hints' ? hints(value) : html(value, true);
  }
  return result;
}

function parseTeaching(raw: string) {
  const parsed = frontmatter(raw); const result: Record<string, unknown> = Object.fromEntries(Object.entries(parsed.data).map(([key, value]) => [camelCase(key), value]));
  result.id = slugify(String(result.title));
  result.contentVersion = Array.from(raw).reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 0).toString(36);
  if (Array.isArray(result.scenes)) result.scenes = result.scenes.map(scene => ({ ...scene as object, id: slugify(String((scene as { label: string }).label)) }));
  for (const [key, value] of Object.entries(sections(parsed.content))) result[camelCase(key)] = /shader/i.test(key) ? shader(value) : html(value, true);
  for (const stage of ['vertexShader', 'fragmentShader']) {
    if (typeof result[stage] !== 'string') continue;
    const split = splitStudentShader(result[stage]); result[stage] = split.source; if (split.template) result[`${stage}Template`] = split.template;
  }
  return result;
}

/** Parsed once in the browser module cache; Vite HMR replaces changed raw Markdown files. */
export const tasks = Object.values(taskFiles).map(parseTask) as unknown as Task[];
export const teaching = Object.values(teachingFiles).map(parseTeaching) as unknown as Teach[];
