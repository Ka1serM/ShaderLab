import { withGlslTree } from '$lib/glsl/parser';

const SQUARE_MATRIX_SIZES = new Map([['mat2', 2], ['mat3', 3], ['mat4', 4]]);

export function rewriteRowMajorMatrixLiterals(source: string): string {
  const insertions = withGlslTree(source, tree => tree.rootNode.descendantsOfType('call_expression').flatMap(call => {
    const size = SQUARE_MATRIX_SIZES.get(call?.childForFieldName('function')?.text ?? '');
    const argumentCount = call?.childForFieldName('arguments')?.namedChildren.filter(child => child?.type !== 'comment').length;
    return call && size && argumentCount === size * size
      ? [{ at: call.startIndex, text: 'transpose(' }, { at: call.endIndex, text: ')' }]
      : [];
  }));
  return insertions
    .sort((a, b) => b.at - a.at)
    .reduce((result, { at, text }) => result.slice(0, at) + text + result.slice(at), source);
}
