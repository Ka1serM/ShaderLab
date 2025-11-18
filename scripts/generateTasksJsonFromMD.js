import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { marked } from "marked";
import katex from "katex";
import { Task } from "../src/lib/models/Task.js";

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
      shaderSections[normalizedKey] = stripCodeFences(value);
    } else {
      contentSections[normalizedKey] = markdownToHtml(value);
    }
  });

  // Combine frontmatter + content + shaders
  const init = {
    ...Object.fromEntries(Object.entries(data).map(([k, v]) => [toCamelCase(k), v])),
    ...contentSections,
    ...shaderSections
  };

  // Instantiate Task so fields are writables by default
  return new Task(init);
});

// Save tasks as JSON (will serialize plain values, you can also export as JS module if needed)
fs.writeFileSync(outputFile, JSON.stringify(tasks.map(t => {
  // extract plain values from the Task's writables
  const result = {};
  for (const key of Object.keys(tasks[0])) {
    if (t[key]?.subscribe) {
      t[key].subscribe(v => result[key] = v)(); // immediately get value
    }
  }
  return result;
}), null, 2));

console.log(`Generated ${tasks.length} tasks at ${outputFile}`);