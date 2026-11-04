import { Language, Parser, type Tree } from 'web-tree-sitter';

let parser: Parser | undefined;

export async function initGlslParser(grammar: string | Uint8Array, runtime?: string) {
  await Parser.init(runtime ? { locateFile: () => runtime } : undefined);
  const next = new Parser();
  next.setLanguage(await Language.load(grammar));
  parser = next;
}

export function withGlslTree<T>(source: string, read: (tree: Tree) => T): T {
  if (!parser) throw new Error('initGlslParser() has to finish before a shader is parsed.');
  const tree = parser.parse(source);
  if (!tree) throw new Error('The GLSL parser returned no tree.');
  try {
    return read(tree);
  } finally {
    tree.delete();
  }
}
