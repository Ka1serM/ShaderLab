import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const grammar = path.join(root, 'node_modules/tree-sitter-glsl');
const output = path.join(root, 'src/lib/glsl/tree-sitter-glsl.wasm');
const workspace = mkdtempSync(path.join(tmpdir(), 'tree-sitter-glsl-'));

try {
  cpSync(path.join(grammar, 'src'), path.join(workspace, 'src'), { recursive: true });
  cpSync(path.join(grammar, 'grammar.js'), path.join(workspace, 'grammar.js'));
  writeFileSync(path.join(workspace, 'tree-sitter.json'), JSON.stringify({
    grammars: [{ name: 'glsl', scope: 'source.glsl', path: '.', 'file-types': ['glsl'] }],
    metadata: { version: '0.2.0', license: 'MIT', description: 'GLSL', links: { repository: 'https://github.com/tree-sitter-grammars/tree-sitter-glsl' } }
  }));
  execFileSync(path.join(root, 'node_modules/.bin/tree-sitter'), ['build', '--wasm', '-o', 'tree-sitter-glsl.wasm', '.'], { cwd: workspace, stdio: 'inherit' });
  cpSync(path.join(workspace, 'tree-sitter-glsl.wasm'), output);
} finally {
  rmSync(workspace, { recursive: true, force: true });
}
