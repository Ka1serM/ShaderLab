// js-yaml is browser-safe but does not ship TypeScript declarations.
// @ts-expect-error
import yaml from 'js-yaml';
import { marked } from 'marked';
import katex from 'katex';
import type { Task } from '$lib/stores/taskStore';
import type { Teach } from '$lib/stores/teachingStore';
import { slugify } from '$lib/utils/slugify';
import { base } from '$app/paths';
import { browser } from '$app/environment';
import { readable } from 'svelte/store';

type ContentEntry = { id: string; path: string };
let indexRequests = new Map<'tasks' | 'teaching', Promise<ContentEntry[]>>();

function contentUrl(path: string) {
  return `${base}/content/${path}`;
}

async function fetchMarkdown(path: string) {
  const response = await fetch(contentUrl(path), { cache: 'no-store' });
  if (!response.ok) throw new Error(`Unable to load ${path}: ${response.status}`);
  return response.text();
}

export function loadContentIndex(kind: 'tasks' | 'teaching') {
  let request = indexRequests.get(kind);
  if (!request) {
    request = fetch(contentUrl(`${kind}/index.txt`), { cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error(`Unable to load ${kind} index: ${response.status}`);
      return (await response.text()).split(/\r?\n/)
        .map(name => name.trim())
        .filter(name => name && !name.startsWith('#'))
        .map(name => ({ id: slugify(name.replace(/\.md$/i, '')), path: `${kind}/${name}` }));
    });
    indexRequests.set(kind, request);
  }
  return request;
}

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
  // Markdown is bundled first-party course content, not user-provided input.
  return marked.parse(rendered) as string;
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

export function parseTask(raw: string): Task {
  const parsed = frontmatter(raw); const result: Record<string, unknown> = Object.fromEntries(Object.entries(parsed.data).map(([key, value]) => [camelCase(key), value]));
  for (const [key, value] of Object.entries(sections(parsed.content))) {
    const name = camelCase(key);
    if (/shader/i.test(key)) {
      const source = shader(value);
      if (name.startsWith('starter')) { const split = splitStudentShader(source); result[name] = split.source; if (split.template) result[`${name}Template`] = split.template; }
      else result[name] = source;
    } else result[name] = name === 'hints' ? hints(value) : html(value, true);
  }
  return result as unknown as Task;
}

export function parseTeaching(raw: string): Teach {
  const parsed = frontmatter(raw); const result: Record<string, unknown> = Object.fromEntries(Object.entries(parsed.data).map(([key, value]) => [camelCase(key), value]));
  result.id = slugify(String(result.title));
  result.contentVersion = Array.from(raw).reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 0).toString(36);
  for (const [key, value] of Object.entries(sections(parsed.content))) result[camelCase(key)] = /shader/i.test(key) ? shader(value) : html(value, true);
  for (const stage of ['vertexShader', 'fragmentShader']) {
    if (typeof result[stage] !== 'string') continue;
    const split = splitStudentShader(result[stage]); result[stage] = split.source; if (split.template) result[`${stage}Template`] = split.template;
  }
  return result as unknown as Teach;
}

export async function loadTaskContent(id: string): Promise<Task | null> {
  const entry = (await loadContentIndex('tasks')).find(item => item.id === slugify(id));
  return entry ? parseTask(await fetchMarkdown(entry.path)) : null;
}

export async function loadTeachingContent(id: string): Promise<Teach | null> {
  const entry = (await loadContentIndex('teaching')).find(item => item.id === slugify(id));
  return entry ? parseTeaching(await fetchMarkdown(entry.path)) : null;
}

async function loadCatalog<T>(kind: 'tasks' | 'teaching', parse: (raw: string) => T) {
  const entries = await loadContentIndex(kind);
  return Promise.all(entries.map(async entry => parse(await fetchMarkdown(entry.path))));
}

export const taskCatalog = readable<Task[]>([], set => {
  if (!browser) return;
  void loadCatalog('tasks', parseTask).then(set).catch(error => console.error('Failed to load task catalog:', error));
});

export const teachingCatalog = readable<Teach[]>([], set => {
  if (!browser) return;
  void loadCatalog('teaching', parseTeaching).then(set).catch(error => console.error('Failed to load teaching catalog:', error));
});
