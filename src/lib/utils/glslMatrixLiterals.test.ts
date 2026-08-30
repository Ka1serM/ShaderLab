import { describe, expect, it } from 'vitest';
import { rewriteRowMajorMatrixLiterals } from './glslMatrixLiterals';

describe('rewriteRowMajorMatrixLiterals', () => {
  it('transposes full flat matrix constructors', () => {
    expect(rewriteRowMajorMatrixLiterals('mat3(1,2,3,4,5,6,7,8,9)'))
      .toBe('mat3(1, 4, 7, 2, 5, 8, 3, 6, 9)');
  });

  it('leaves scalar and incomplete constructors untouched', () => {
    expect(rewriteRowMajorMatrixLiterals('mat4(1.0)')).toBe('mat4(1.0)');
    expect(rewriteRowMajorMatrixLiterals('mat4(1, 2')).toBe('mat4(1, 2');
  });

  it('preserves line counts used by diagnostics', () => {
    const source = 'mat3(1,2,3,\n4,5,6,\n7,8,9);\nerror';
    expect(rewriteRowMajorMatrixLiterals(source).split('\n')).toHaveLength(source.split('\n').length);
  });
});
