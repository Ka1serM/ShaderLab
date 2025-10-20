import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { marked } from "marked";
import katex from "katex";

// Setup paths
const lessonsFolder = path.join(process.cwd(), "src/data/lessons");
const outputFile = path.join(process.cwd(), "src/data/lessons.json");

// Strip GLSL code fences
function stripCodeFences(code) {
  return code.replace(/```(?:glsl)?\n?/g, "").replace(/```$/, "").trim();
}

// Markdown → HTML with KaTeX
function markdownToHtml(md) {
  if (!md) return "";
  // Inline math
  md = md.replace(/\$(.+?)\$/g, (_, expr) => {
    try {
      return katex.renderToString(expr, { throwOnError: false });
    } catch {
      return _;
    }
  });
  // Block math
  md = md.replace(/\$\$(.+?)\$\$/gs, (_, expr) => {
    try {
      return katex.renderToString(expr, {
        displayMode: true,
        throwOnError: false,
      });
    } catch {
      return _;
    }
  });
  return marked.parse(md);
}

// Convert to camelCase
function toCamelCase(str) {
  return str
    .replace(/\s(.)/g, (_, group1) => group1.toUpperCase())
    .replace(/\s/g, "")
    .replace(/^(.)/, (_, group1) => group1.toLowerCase());
}

// Normalize hints to array of strings
function normalizeHints(hints) {
  if (!hints) return [];
  if (Array.isArray(hints)) {
    return hints.map((h) => {
      if (typeof h === "object" && h !== null) {
        const [k, v] = Object.entries(h)[0];
        return `${k}: ${v}`;
      }
      return String(h);
    });
  }
  return [String(hints)];
}

// Read + parse markdown lessons
const files = fs.readdirSync(lessonsFolder).filter((f) => f.endsWith(".md"));

const lessons = files.map((file) => {
  const raw = fs.readFileSync(path.join(lessonsFolder, file), "utf-8");
  const { data, content } = matter(raw);

  // Split markdown into sections by H1 (#)
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

  // Separate shader vs text sections
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

  // Merge and normalize
  return {
    ...Object.fromEntries(
      Object.entries(data).map(([k, v]) => [toCamelCase(k), v])
    ),
    hints: normalizeHints(data.hints),
    ...contentSections,
    ...shaderSections,
  };
});

// Write JSON output
fs.writeFileSync(outputFile, JSON.stringify({ lessons }, null, 2));
console.log(`✅ Generated ${lessons.length} lessons at ${outputFile}`);
