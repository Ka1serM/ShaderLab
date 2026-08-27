import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { marked } from "marked";
import katex from "katex";
import { splitStudentShader } from "./shaderTemplate.js";

const tasksFolder = path.join(process.cwd(), "src/lib/data/tasks");
const outputFile = path.join(process.cwd(), "src/lib/data/tasks.json");

function stripCodeFences(code) {
  return code.replace(/```(?:glsl)?\n?/g, "").replace(/```$/, "").trim();
}

function markdownToHtml(md) {
  if (!md) return "";
  md = md.replace(/\$\$(.+?)\$\$/gs, (_, expr) => {
    try {
      return katex.renderToString(expr, { displayMode: true, throwOnError: false });
    } catch {
      return _;
    }
  });
  md = md.replace(/\$(.+?)\$/g, (_, expr) => {
    try {
      return katex.renderToString(expr, { throwOnError: false });
    } catch {
      return _;
    }
  });
  return marked.parse(md);
}

function markdownHints(md) {
  const heading = /^##\s+Hint(?:\s+\d+)?\s*$/gim;
  const starts = [...md.matchAll(heading)].map(match => match.index ?? 0);
  if (starts.length === 0) return md.trim() ? [markdownToHtml(md)] : [];

  return starts.map((start, index) => {
    const headingEnd = md.indexOf('\n', start);
    const end = index + 1 < starts.length ? starts[index + 1] : md.length;
    const bodyStart = headingEnd === -1 ? md.length : headingEnd + 1;
    return markdownToHtml(md.slice(bodyStart, end).trim());
  });
}

function toCamelCase(str) {
  return str
    .replace(/\s(.)/g, (_, g1) => g1.toUpperCase())
    .replace(/\s/g, "")
    .replace(/^(.)/, (_, g1) => g1.toLowerCase());
}

const files = fs.readdirSync(tasksFolder).filter(f => f.endsWith(".md"));

const tasks = files.map(file => {
  const raw = fs.readFileSync(path.join(tasksFolder, file), "utf-8");
  const { data, content } = matter(raw);

  const sections = {};
  let currentKey = null;
  let buffer = [];

  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^#\s+(.*)$/);
    if (match) {
      if (currentKey) sections[currentKey] = buffer.join("\n").trim();
      currentKey = match[1].trim();
      buffer = [];
    } else {
      buffer.push(line);
    }
  }
  if (currentKey) sections[currentKey] = buffer.join("\n").trim();

  const shaderSections = {};
  const contentSections = {};

  Object.entries(sections).forEach(([key, value]) => {
    const normalizedKey = toCamelCase(key);
    if (/shader/i.test(key)) {
      const source = stripCodeFences(value);
      if (normalizedKey.startsWith('starter')) {
        const studentShader = splitStudentShader(source);
        shaderSections[normalizedKey] = studentShader.source;
        if (studentShader.template) shaderSections[`${normalizedKey}Template`] = studentShader.template;
      } else {
        shaderSections[normalizedKey] = source;
      }
    } else if (normalizedKey === 'hints') {
      contentSections.hints = markdownHints(value);
    } else {
      contentSections[normalizedKey] = markdownToHtml(value);
    }
  });

  return {
    ...Object.fromEntries(Object.entries(data).map(([k, v]) => [toCamelCase(k), v])),
    ...contentSections,
    ...shaderSections
  };
});

fs.writeFileSync(outputFile, JSON.stringify(tasks, null, 2));
console.log(`Generated ${tasks.length} tasks at ${outputFile}`);
