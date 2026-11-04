import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { initGlslParser } from '../src/lib/glsl/parser';
import { rewriteRowMajorMatrixLiterals } from '../src/lib/utils/glslMatrixLiterals';

const flat4 = 'mat4(1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 11.0, 12.0, 13.0, 14.0, 15.0, 16.0)';
const inMain = (statement: string) => `void main() {\n  ${statement}\n}`;

beforeAll(() => initGlslParser(readFileSync('src/lib/glsl/tree-sitter-glsl.wasm')));

describe('rewriteRowMajorMatrixLiterals', () => {
  it('wraps full flat matrix constructors in transpose', () => {
    expect(rewriteRowMajorMatrixLiterals(inMain('mat3 m = mat3(1,2,3,4,5,6,7,8,9);'))).toBe(inMain('mat3 m = transpose(mat3(1,2,3,4,5,6,7,8,9));'));
    expect(rewriteRowMajorMatrixLiterals(inMain('mat2 m = mat2(a, b, c, d);'))).toBe(inMain('mat2 m = transpose(mat2(a, b, c, d));'));
  });

  it('counts arguments, not the commas inside them', () => {
    const literal = 'mat3(cos(a), -sin(a), 0.0, sin(a), cos(a), 0.0, v[i], max(x, y), 1.0)';
    expect(rewriteRowMajorMatrixLiterals(inMain(`mat3 m = ${literal};`))).toBe(inMain(`mat3 m = transpose(${literal});`));
  });

  it('leaves other constructors untouched', () => {
    for (const statement of ['mat4 m = mat4(1.0);', 'mat3 m = mat3(model);', 'mat4 m = mat4(c0, c1, c2, c3);', 'mat4 m;', 'mat4 m[2] = mat4[2](a, b);', 'mat4 m = mat4(1, 2']) {
      expect(rewriteRowMajorMatrixLiterals(inMain(statement))).toBe(inMain(statement));
    }
  });

  it('ignores matrices in comments and comments between arguments', () => {
    const source = `// mat4( wird zeilenweise geschrieben\n/* ${flat4} */\nconst mat2 M = mat2(1.0, /* oben */ 2.0,\n  3.0, 4.0);`;
    expect(rewriteRowMajorMatrixLiterals(source)).toBe(`// mat4( wird zeilenweise geschrieben\n/* ${flat4} */\nconst mat2 M = transpose(mat2(1.0, /* oben */ 2.0,\n  3.0, 4.0));`);
  });

  it('finds the literal after text outside ASCII', () => {
    expect(rewriteRowMajorMatrixLiterals(`// Größe → 90°\nconst mat4 M = ${flat4};`)).toBe(`// Größe → 90°\nconst mat4 M = transpose(${flat4});`);
  });

  it('keeps rewriting next to code the parser does not know', () => {
    const source = `precision highp float;\nconst vec3 L[2] = vec3[](vec3(1.0), vec3(2.0));\n${inMain(`mat4 m = ${flat4};`)}`;
    expect(rewriteRowMajorMatrixLiterals(source)).toBe(`precision highp float;\nconst vec3 L[2] = vec3[](vec3(1.0), vec3(2.0));\n${inMain(`mat4 m = transpose(${flat4});`)}`);
  });

  it('wraps nested literals separately', () => {
    const inner = 'mat2(1, 2, 3, 4)';
    expect(rewriteRowMajorMatrixLiterals(inMain(`mat2 m = mat2(${inner}[0][0], 0, 0, 1);`))).toBe(inMain(`mat2 m = transpose(mat2(transpose(${inner})[0][0], 0, 0, 1));`));
  });

  it('preserves every line', () => {
    const source = 'const mat3 M = mat3(1,2,3,\n4,5,6,\n7,8,9);\nerror';
    expect(rewriteRowMajorMatrixLiterals(source).split('\n')).toEqual(['const mat3 M = transpose(mat3(1,2,3,', '4,5,6,', '7,8,9));', 'error']);
  });
});
