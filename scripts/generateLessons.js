import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { marked } from "marked";

const lessonsFolder = path.join(process.cwd(), "src/data/lessons");
const outputFile = path.join(process.cwd(), "src/data/lessons.json");

function stripCodeFences(code) {
  return code.replace(/```(?:glsl)?\n?/g, "").replace(/```$/, "").trim();
}

const files = fs.readdirSync(lessonsFolder).filter(f => f.endsWith(".md"));

const lessons = files.map(file => {
  const raw = fs.readFileSync(path.join(lessonsFolder, file), "utf-8");
  const { data, content } = matter(raw);

  const sections = {};
  let currentKey = null;
  let buffer = [];

  const lines = content.split(/\r?\n/);
  lines.forEach(line => {
    const match = line.match(/^#\s+(.*)$/);
    if (match) {
      if (currentKey) sections[currentKey] = buffer.join("\n").trim();
      currentKey = match[1].trim();
      buffer = [];
    } else {
      buffer.push(line);
    }
  });
  if (currentKey) sections[currentKey] = buffer.join("\n").trim();

  return {
    category: data.category,
    type: data.type,
    modelPath: data.modelPath,
    title: data.title,
    hints: data.hints || [],
    task: sections["Task"] || "",
    theory: sections["Theory"] || "",
    starterVertexShader: stripCodeFences(sections["Starter Vertex Shader"] || ""),
    starterFragmentShader: stripCodeFences(sections["Starter Fragment Shader"] || ""),
    referenceVertexShader: stripCodeFences(sections["Reference Vertex Shader"] || ""),
    referenceFragmentShader: stripCodeFences(sections["Reference Fragment Shader"] || ""),
  };
});

fs.writeFileSync(outputFile, JSON.stringify({ lessons }, null, 2));
console.log(`Generated ${lessons.length} lessons at ${outputFile}`);
