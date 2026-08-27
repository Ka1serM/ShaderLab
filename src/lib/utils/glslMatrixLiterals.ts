function findMatchingParen(src: string, openIndex: number): number {
	let depth = 0;
	for (let i = openIndex; i < src.length; i++) {
		const c = src[i];
		if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
		if (c === '/' && src[i + 1] === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i++; continue; }
		if (c === '(') depth++;
		else if (c === ')') { depth--; if (depth === 0) return i; }
	}
	return -1;
}

function splitTopLevel(argText: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let start = 0;
	for (let i = 0; i < argText.length; i++) {
		const c = argText[i];
		if (c === '/' && argText[i + 1] === '/') { while (i < argText.length && argText[i] !== '\n') i++; continue; }
		if (c === '/' && argText[i + 1] === '*') { i += 2; while (i < argText.length && !(argText[i] === '*' && argText[i + 1] === '/')) i++; i++; continue; }
		if (c === '(') depth++;
		else if (c === ')') depth--;
		else if (c === ',' && depth === 0) { parts.push(argText.slice(start, i)); start = i + 1; }
	}
	parts.push(argText.slice(start));
	return parts.map(p => p.trim()).filter(p => p.length > 0);
}

/** Index permutation for an n×n transpose applied to a flat, row-major-read argument list. */
function transposeFlat(values: string[], n: number): string[] {
	const out = new Array<string>(n * n);
	for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) out[c * n + r] = values[r * n + c];
	return out;
}

function rewriteUnsafe(source: string): string {
	let result = '';
	let cursor = 0;
	const re = /\b(mat4|mat3)\s*\(/g;
	let match: RegExpExecArray | null;
	while ((match = re.exec(source))) {
		const openIndex = match.index + match[0].length - 1;
		if (openIndex < cursor) continue;
		const closeIndex = findMatchingParen(source, openIndex);
		if (closeIndex === -1) return source; // unbalanced -> mid-keystroke, leave untouched
		const argText = source.slice(openIndex + 1, closeIndex);
		const args = splitTopLevel(argText);
		const n = match[1] === 'mat4' ? 4 : 3;
		result += source.slice(cursor, match.index);
		if (args.length === n * n) {
			const reordered = transposeFlat(args, n);
			const newlineCount = (argText.match(/\n/g) ?? []).length;
			// Newline count of the replaced span is preserved so later line numbers
			// (and the GLSL compiler's error line numbers) stay unaffected.
			result += `${match[1]}(${reordered.join(', ')})` + '\n'.repeat(newlineCount);
		} else {
			result += source.slice(match.index, closeIndex + 1);
		}
		cursor = closeIndex + 1;
	}
	result += source.slice(cursor);
	return result;
}

/**
 * Rewrites `mat4(...)`/`mat3(...)` calls that list all 16/9 components flat (the form every
 * task in this course uses) from row-major reading order to GLSL's actual column-major fill
 * order, so a matrix typed exactly as it looks on paper compiles to the intended matrix.
 * Constructor forms that aren't ambiguous (single-argument, or column-vector forms) are left
 * untouched. Runs on every keystroke before compilation, so a mid-edit unbalanced shader must
 * never throw — it is returned unchanged and left for the GLSL compiler's own error reporting.
 */
export function rewriteRowMajorMatrixLiterals(source: string): string {
	try {
		return rewriteUnsafe(source);
	} catch {
		return source;
	}
}
