import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { marked } from 'marked';
import { splitStudentShader } from './shaderTemplate.js';

const teachingFolder = path.join(process.cwd(), 'src/lib/data/teaching');
const outputFile = path.join(process.cwd(), 'src/lib/data/teaching.json');

function markdownToHtml(value) {
  return value?.trim() ? marked.parse(value.trim()) : '';
}

function stripCodeFences(code) {
  return code.replace(/^```(?:glsl)?\s*/i, '').replace(/```\s*$/i, '').trim();
}

function toCamelCase(value) {
  return value.replace(/\s(.)/g, (_, char) => char.toUpperCase()).replace(/\s/g, '')
    .replace(/^(.)/, (_, char) => char.toLowerCase());
}

function parseSections(content) {
  const sections = {};
  let current = null;
  let buffer = [];
  for (const line of content.split(/\r?\n/)) {
    const heading = line.match(/^#\s+(.*)$/);
    if (heading) {
      if (current) sections[current] = buffer.join('\n').trim();
      current = heading[1].trim();
      buffer = [];
    } else buffer.push(line);
  }
  if (current) sections[current] = buffer.join('\n').trim();
  return sections;
}

const files = fs.readdirSync(teachingFolder).filter(file => file.endsWith('.md'));
const definitions = files.map(file => {
  const raw = fs.readFileSync(path.join(teachingFolder, file), 'utf8');
  const { data, content } = matter(raw);
  const sections = parseSections(content);
  const result = Object.fromEntries(Object.entries(data).map(([key, value]) => [toCamelCase(key), value]));

  for (const [key, value] of Object.entries(sections)) {
    result[toCamelCase(key)] = /shader/i.test(key) ? stripCodeFences(value) : markdownToHtml(value);
  }
  // @control annotations are parsed at runtime from the live editor source, not here.
  for (const stage of ['vertexShader', 'fragmentShader']) {
    if (!result[stage]) continue;
    const split = splitStudentShader(result[stage]);
    result[stage] = split.source;
    if (split.template) result[`${stage}Template`] = split.template;
  }
  return result;
});

fs.writeFileSync(outputFile, JSON.stringify(definitions, null, 2) + '\n');
console.log(`Generated ${definitions.length} teaching definitions at ${outputFile}`);
