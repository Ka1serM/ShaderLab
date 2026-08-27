export type TeachingValue = number | number[] | string | boolean;

export interface TeachingControl {
	id: string;
	label: string;
	type: 'slider' | 'vector3' | 'color' | 'checkbox' | 'matrix4';
	min?: number;
	max?: number;
	step?: number;
	readOnly?: boolean;
	default: TeachingValue;
	uniform?: string;
}

const ANNOTATION = /^\s*\/\/\s*@control\s+(\S+)\s+(\S+)(.*)$/;
const UNIFORM = /\buniform\s+\w+\s+(\w+)\s*;/;
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
	vec3: 'vector3'
};

function parseDefault(type: TeachingControl['type'], raw: string | undefined): TeachingValue {
	if (type === 'matrix4') return raw ? raw.split(',').map(Number) : [...IDENTITY];
	if (type === 'vector3') return raw ? raw.split(',').map(Number) : [0, 0, 0];
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

/**
 * Reads `// @control <id> <type> label="…" min=… max=… step=… default=…` annotations and binds each
 * to the next `uniform` declaration below it. Parsing the live shader source is what lets the
 * teaching panel grow a control the moment an annotated uniform is typed into the editor.
 */
export function parseShaderControls(source: string): TeachingControl[] {
	const controls: TeachingControl[] = [];
	const lines = source.split(/\r?\n/);
	for (let index = 0; index < lines.length; index += 1) {
		const annotation = lines[index].match(ANNOTATION);
		if (!annotation) continue;
		const uniform = lines.slice(index + 1).find(line => UNIFORM.test(line));
		const attributes: Record<string, string> = {};
		for (const match of annotation[3].matchAll(ATTRIBUTE)) {
			attributes[match[1] ?? match[4]] = match[3] ?? match[5];
		}
		// Half-typed annotations are skipped rather than rendered as a broken control.
		const type = TYPES[annotation[2]];
		if (!type) continue;
		// A duplicated id would fight over one value, and would crash a keyed {#each}.
		if (controls.some(control => control.id === annotation[1])) continue;
		controls.push({
			id: annotation[1],
			type,
			label: attributes.label ?? annotation[1],
			min: attributes.min === undefined ? undefined : Number(attributes.min),
			max: attributes.max === undefined ? undefined : Number(attributes.max),
			step: attributes.step === undefined ? undefined : Number(attributes.step),
			readOnly: attributes.readonly === 'true',
			default: parseDefault(type, attributes.default),
			uniform: uniform?.match(UNIFORM)?.[1]
		});
	}
	return controls;
}

/** Guards against an override left over from before a control changed its type in the editor. */
function fits(type: TeachingControl['type'], value: TeachingValue | undefined) {
	switch (type) {
		case 'matrix4': return Array.isArray(value) && value.length === 16;
		case 'vector3': return Array.isArray(value) && value.length === 3;
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
