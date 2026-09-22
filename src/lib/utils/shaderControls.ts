export type TeachingValue = number | number[] | string | boolean;

export interface TeachingControl {
	id: string;
	label: string;
	type: 'slider' | 'vector3' | 'vector4' | 'color' | 'checkbox' | 'matrix4';
	min?: number;
	max?: number;
	step?: number;
	readOnly?: boolean;
	visualization?: 'vector' | 'point';
	editable?: boolean;
	visualizationOrigin?: [number, number, number];
	hidden?: boolean;
	target?: string;
	inverse?: string;
	transform?: 'translate' | 'rotate' | 'scale';
	default: TeachingValue;
	uniform?: string;
	readback?: string;
}

const CONTROL_ANNOTATION = /^\s*\/\/\s*@control\b(.*)$/;
const READBACK_ANNOTATION = /^\s*\/\/\s*@readback\b(.*)$/;
const UNIFORM = /^\s*uniform\s+(?:lowp\s+|mediump\s+|highp\s+)?(float|int|bool|vec3|vec4|mat4)\s+([A-Za-z_]\w*)\s*;\s*(?:\/\/.*)?$/;
const READBACK_DECLARATION = /^\s*(float|vec3|vec4|mat4)\s+([A-Za-z_]\w*)\b/;
const MATRIX_DECLARATION = /\bmat4\s+(\w+)\b/;
const VECTOR3_DECLARATION = /\bvec3\s+(\w+)\b/;
const VECTOR4_DECLARATION = /\bvec4\s+(\w+)\b/;
const FLOAT_DECLARATION = /\bfloat\s+(\w+)\b/;
const ATTRIBUTE = /(\w+)=(["'])(.*?)\2|(\w+)=([^\s]+)/g;
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

const TYPES: Record<string, TeachingControl['type']> = {
	slider: 'slider',
	float: 'slider',
	int: 'slider',
	color: 'color',
	checkbox: 'checkbox',
	bool: 'checkbox',
	matrix4: 'matrix4',
	matrix: 'matrix4',
	mat4: 'matrix4',
	vector3: 'vector3',
	vec3: 'vector3',
	vector4: 'vector4',
	vec4: 'vector4'
};

const READBACK_DECLARATIONS: Partial<Record<TeachingControl['type'], RegExp>> = {
	slider: FLOAT_DECLARATION,
	vector3: VECTOR3_DECLARATION,
	vector4: VECTOR4_DECLARATION,
	matrix4: MATRIX_DECLARATION
};

function finiteNumberList(raw: string | undefined, length: number, fallback: number[]) {
	if (!raw) return [...fallback];
	const values = raw.split(',').map(Number);
	return values.length === length && values.every(Number.isFinite) ? values : [...fallback];
}

function parseDefault(type: TeachingControl['type'], raw: string | undefined): TeachingValue {
	if (type === 'matrix4') return finiteNumberList(raw, 16, IDENTITY);
	if (type === 'vector3') return finiteNumberList(raw, 3, [0, 0, 0]);
	if (type === 'vector4') return finiteNumberList(raw, 4, [0, 0, 0, 0]);
	if (type === 'color') {
		if (raw && /^#[0-9a-f]{6}$/i.test(raw)) return raw;
		return finiteNumberList(raw, 3, [0, 0, 0]);
	}
	if (type === 'checkbox') return raw === 'true';
	const value = Number(raw ?? 0);
	return Number.isFinite(value) ? value : 0;
}

function readbackInitialValue(type: TeachingControl['type']): TeachingValue {
	if (type === 'matrix4') return Array(16).fill(0);
	if (type === 'vector3') return [0, 0, 0];
	if (type === 'vector4') return [0, 0, 0, 0];
	return 0;
}

function parseVector3(raw: string | undefined): [number, number, number] | undefined {
	if (!raw) return undefined;
	const value = raw.split(',').map(Number);
	return value.length === 3 && value.every(Number.isFinite)
		? value as [number, number, number]
		: undefined;
}

function parseVisualization(type: TeachingControl['type'], raw: string | undefined) {
	if (type !== 'vector3') return undefined;
	if (raw === 'point') return 'point' as const;
	if (raw === 'vector') return 'vector' as const;
	return undefined;
}

function parseAttributes(source: string): Record<string, string> | undefined {
	const attributes: Record<string, string> = {};
	let cursor = 0;
	for (const match of source.matchAll(ATTRIBUTE)) {
		if (source.slice(cursor, match.index).trim()) return undefined;
		attributes[match[1] ?? match[4]] = match[3] ?? match[5];
		cursor = (match.index ?? 0) + match[0].length;
	}
	return source.slice(cursor).trim() ? undefined : attributes;
}

/**
 * `@control` binds an editable input to the next uniform. `@readback` binds a read-only display to
 * the next local float, vec3, vec4 or mat4 declaration, whose value is captured from the GPU by transform feedback.
 */
export function parseShaderControls(source: string): TeachingControl[] {
	const controls: TeachingControl[] = [];
	const lines = source.split(/\r?\n/);
	for (let index = 0; index < lines.length; index += 1) {
		const controlAnnotation = lines[index].match(CONTROL_ANNOTATION);
		const readbackAnnotation = lines[index].match(READBACK_ANNOTATION);
		if (!controlAnnotation && !readbackAnnotation) continue;
		const isReadback = Boolean(readbackAnnotation);
		let declaration: string | undefined;
		let declarationMatch: RegExpMatchArray | null = null;
		for (let following = index + 1; following < lines.length; following += 1) {
			if (CONTROL_ANNOTATION.test(lines[following]) || READBACK_ANNOTATION.test(lines[following])) break;
			declarationMatch = lines[following].match(isReadback ? READBACK_DECLARATION : UNIFORM);
			if (declarationMatch) {
				declaration = lines[following];
				break;
			}
		}
		if (!declaration || !declarationMatch) continue;
		const id = declarationMatch[2];
		const attributeSource = isReadback ? readbackAnnotation![1] : controlAnnotation![1];
		const attributes = parseAttributes(attributeSource);
		if (!attributes) continue;
		const declaredType = declarationMatch[1];
		const type = attributes.display === undefined
			? TYPES[declaredType]
			: attributes.display === 'color' && declaredType === 'vec3' ? 'color' : undefined;
		// Half-typed annotations and unsupported declarations are skipped rather than rendered broken.
		if (!type || (isReadback && !READBACK_DECLARATIONS[type])) continue;
		const uniform = isReadback ? undefined : id;
		const readback = isReadback ? id : undefined;
		// A duplicated id would fight over one value, and would crash a keyed {#each}.
		if (controls.some(control => control.id === id)) continue;
		const finiteAttribute = (name: string) => {
			if (attributes[name] === undefined) return undefined;
			const value = Number(attributes[name]);
			return Number.isFinite(value) ? value : undefined;
		};
		const visualization = parseVisualization(type, attributes.visualize);
		const target = attributes.target ?? (!isReadback && visualization ? id : undefined);
		const transform = type === 'matrix4' && ['translate', 'rotate', 'scale'].includes(attributes.transform)
			? attributes.transform as TeachingControl['transform']
			: undefined;
		controls.push({
			id,
			type,
			label: attributes.label ?? id,
				min: finiteAttribute('min'),
				max: finiteAttribute('max'),
				step: finiteAttribute('step'),
			readOnly: isReadback || attributes.readonly === 'true',
			visualization,
			editable: visualization !== undefined && target !== undefined,
			visualizationOrigin: type === 'vector3' ? parseVector3(attributes.origin) : undefined,
			hidden: attributes.hidden === 'true' || (isReadback && visualization !== undefined && attributes.label === undefined),
			target,
			inverse: attributes.inverse,
			transform,
			default: isReadback ? readbackInitialValue(type) : parseDefault(type, attributes.default),
			uniform,
			readback
		});
	}
	return controls;
}

/** Guards against an override left over from before a control changed its type in the editor. */
function fits(type: TeachingControl['type'], value: TeachingValue | undefined) {
	switch (type) {
		case 'matrix4': return Array.isArray(value) && value.length === 16 && value.every(Number.isFinite);
		case 'vector3': return Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
		case 'vector4': return Array.isArray(value) && value.length === 4 && value.every(Number.isFinite);
		case 'color': return (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) || (Array.isArray(value) && value.length === 3 && value.every(Number.isFinite));
		case 'checkbox': return typeof value === 'boolean';
		case 'slider': return typeof value === 'number';
		default: return value !== undefined;
	}
}

/** The value a control is showing: the user's override when usable, otherwise the annotated default. */
export function controlValues(
	controls: TeachingControl[],
	overrides: Record<string, TeachingValue>
): Record<string, TeachingValue> {
	return Object.fromEntries(controls.map(control => [
		control.id,
		fits(control.type, overrides[control.id]) ? overrides[control.id] : control.default
	]));
}
