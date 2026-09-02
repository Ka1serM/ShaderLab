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
	visualizationOrigin?: [number, number, number];
	default: TeachingValue;
	uniform?: string;
	readback?: string;
}

const ANNOTATION = /^\s*\/\/\s*@control\s+(\S+)\s+(\S+)(.*)$/;
const READBACK_ANNOTATION = /^\s*\/\/\s*@readback\s+(\S+)\s+(\S+)(.*)$/;
const UNIFORM = /\buniform\s+\w+\s+(\w+)\s*;/;
const MATRIX_DECLARATION = /\bmat4\s+(\w+)\b/;
const VECTOR3_DECLARATION = /\bvec3\s+(\w+)\b/;
const VECTOR4_DECLARATION = /\bvec4\s+(\w+)\b/;
const FLOAT_DECLARATION = /\bfloat\s+(\w+)\b/;
const ATTRIBUTE = /(\w+)=(["'])(.*?)\2|(\w+)=([^\s]+)/g;
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

const TYPES: Record<string, TeachingControl['type']> = {
	slider: 'slider',
	float: 'slider',
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

function parseDefault(type: TeachingControl['type'], raw: string | undefined): TeachingValue {
	if (type === 'matrix4') return raw ? raw.split(',').map(Number) : [...IDENTITY];
	if (type === 'vector3') return raw ? raw.split(',').map(Number) : [0, 0, 0];
	if (type === 'vector4') return raw ? raw.split(',').map(Number) : [0, 0, 0, 0];
	if (type === 'color') {
		if (raw?.startsWith('#')) return raw;
		return raw ? raw.split(',').map(Number) : [0, 0, 0];
	}
	if (raw?.startsWith('#')) return raw;
	if (raw === 'true') return true;
	if (raw === 'false') return false;
	if (raw === undefined) return 0;
	return Number.isNaN(Number(raw)) ? raw : Number(raw);
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
	if (raw === 'true' || raw === 'vector' || raw === 'arrow') return 'vector' as const;
	return undefined;
}

/**
 * `@control` binds an editable input to the next uniform. `@readback` binds a read-only display to
 * the next local float, vec3, vec4 or mat4 declaration, whose value is captured from the GPU by transform feedback.
 */
export function parseShaderControls(source: string): TeachingControl[] {
	const controls: TeachingControl[] = [];
	const lines = source.split(/\r?\n/);
	for (let index = 0; index < lines.length; index += 1) {
		const controlAnnotation = lines[index].match(ANNOTATION);
		const readbackAnnotation = lines[index].match(READBACK_ANNOTATION);
		const annotation = controlAnnotation ?? readbackAnnotation;
		if (!annotation) continue;
		const isReadback = Boolean(readbackAnnotation);
		const type = TYPES[annotation[2]];
		// Half-typed annotations and unsupported readback types are skipped rather than rendered broken.
		if (!type || (isReadback && !READBACK_DECLARATIONS[type])) continue;
		let declaration: string | undefined;
		for (let following = index + 1; following < lines.length; following += 1) {
			if (ANNOTATION.test(lines[following]) || READBACK_ANNOTATION.test(lines[following])) break;
			const matcher = isReadback ? READBACK_DECLARATIONS[type]! : UNIFORM;
			if (matcher.test(lines[following])) {
				declaration = lines[following];
				break;
			}
		}
		if (isReadback && !declaration) continue;
		const uniform = isReadback ? undefined : declaration;
		const readback = isReadback ? declaration?.match(READBACK_DECLARATIONS[type] as RegExp)?.[1] : undefined;
		const attributes: Record<string, string> = {};
		for (const match of annotation[3].matchAll(ATTRIBUTE)) {
			attributes[match[1] ?? match[4]] = match[3] ?? match[5];
		}
		// A duplicated id would fight over one value, and would crash a keyed {#each}.
		if (controls.some(control => control.id === annotation[1])) continue;
		const finiteAttribute = (name: string) => {
			if (attributes[name] === undefined) return undefined;
			const value = Number(attributes[name]);
			return Number.isFinite(value) ? value : undefined;
		};
		controls.push({
			id: annotation[1],
			type,
			label: attributes.label ?? annotation[1],
				min: finiteAttribute('min'),
				max: finiteAttribute('max'),
				step: finiteAttribute('step'),
			readOnly: isReadback || attributes.readonly === 'true',
			visualization: parseVisualization(type, attributes.visualize),
			visualizationOrigin: type === 'vector3' ? parseVector3(attributes.origin) : undefined,
			default: isReadback ? readbackInitialValue(type) : parseDefault(type, attributes.default),
			uniform: uniform?.match(UNIFORM)?.[1],
			readback
		});
	}
	return controls;
}

/** Guards against an override left over from before a control changed its type in the editor. */
function fits(type: TeachingControl['type'], value: TeachingValue | undefined) {
	switch (type) {
		case 'matrix4': return Array.isArray(value) && value.length === 16;
		case 'vector3': return Array.isArray(value) && value.length === 3;
		case 'vector4': return Array.isArray(value) && value.length === 4;
		case 'color': return typeof value === 'string' || (Array.isArray(value) && value.length === 3);
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
