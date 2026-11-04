import yaml from 'js-yaml';
import { z } from 'zod';
import type { Node } from 'web-tree-sitter';
import { withGlslTree } from '$lib/glsl/parser';

export type TeachingValue = number | number[] | boolean;

export interface TeachingControl {
	id: string;
	label: string;
	type: 'slider' | 'vector3' | 'vector4' | 'color' | 'checkbox' | 'matrix4' | 'options';
	min?: number;
	max?: number;
	step?: number;
	readOnly?: boolean;
	visualization?: 'vector' | 'point';
	editable?: boolean;
	hidden?: boolean;
	pivot?: string;
	transform?: 'translate' | 'rotate' | 'scale';
	object?: number;
	options?: string[];
	default: TeachingValue;
	uniform?: string;
	readback?: string;
}

export type AnnotationError = { line: number; message: string };

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const numbers = (length: number) => z.array(z.number()).length(length);

const DECLARATIONS = {
	float: { type: 'slider', value: z.number(), initial: 0, readback: true },
	int: { type: 'slider', value: z.int(), initial: 0, readback: false },
	bool: { type: 'checkbox', value: z.boolean(), initial: false, readback: false },
	vec3: { type: 'vector3', value: numbers(3), initial: [0, 0, 0], readback: true },
	vec4: { type: 'vector4', value: numbers(4), initial: [0, 0, 0, 0], readback: true },
	mat4: { type: 'matrix4', value: numbers(16), initial: IDENTITY, readback: true }
} as const;

type GlslType = keyof typeof DECLARATIONS;

const READBACK_ATTRIBUTES = {
	label: z.string(),
	min: z.number(),
	max: z.number(),
	step: z.number(),
	hidden: z.boolean(),
	visualize: z.enum(['point', 'vector'])
};

const CONTROL_ATTRIBUTES = {
	...READBACK_ATTRIBUTES,
	readonly: z.boolean(),
	display: z.literal('color'),
	transform: z.enum(['translate', 'rotate', 'scale']),
	pivot: z.string(),
	object: z.int().nonnegative(),
	options: z.array(z.string()).min(1)
};

const ONLY_FOR: Partial<Record<keyof typeof CONTROL_ATTRIBUTES, GlslType>> = {
	display: 'vec3',
	visualize: 'vec3',
	transform: 'mat4',
	pivot: 'mat4',
	object: 'mat4',
	options: 'int'
};

const ANNOTATIONS = ['@control', '@readback'] as const;
type Annotation = typeof ANNOTATIONS[number];

function annotation(node: Node): { kind: Annotation; attributes: string } | undefined {
	if (node.type !== 'comment' || !node.text.startsWith('//')) return undefined;
	const text = node.text.slice(2).trim();
	const kind = ANNOTATIONS.find(name => text === name || text.startsWith(`${name} `));
	return kind && { kind, attributes: text.slice(kind.length).trim() };
}

function declaredVariable(node: Node | null) {
	if (node?.type !== 'declaration') return undefined;
	const declarator = node.childForFieldName('declarator');
	const name = declarator?.type === 'init_declarator' ? declarator.childForFieldName('declarator') : declarator;
	const type = node.childForFieldName('type')?.text;
	if (name?.type !== 'identifier' || !type) return undefined;
	return { name: name.text, type, uniform: node.children.some(child => child?.type === 'uniform') };
}

function followingDeclaration(comment: Node) {
	let node = comment.nextNamedSibling;
	while (node?.type === 'comment' && !annotation(node)) node = node.nextNamedSibling;
	return declaredVariable(node);
}

function readAttributes(source: string): unknown {
	return source ? yaml.load(source, { schema: yaml.JSON_SCHEMA }) : {};
}

function issueMessage(error: z.ZodError) {
	const issue = error.issues[0];
	return issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message;
}

type Attributes = Partial<z.infer<z.ZodObject<typeof CONTROL_ATTRIBUTES>>> & { default?: TeachingValue };

function control(kind: Annotation, name: string, glslType: GlslType, attributes: Attributes): TeachingControl {
	const declaration = DECLARATIONS[glslType];
	const readback = kind === '@readback';
	const type = attributes.options ? 'options' : attributes.display === 'color' ? 'color' : declaration.type;
	return {
		id: name,
		type,
		label: attributes.label ?? name,
		min: attributes.min,
		max: attributes.max,
		step: attributes.step,
		readOnly: readback || attributes.readonly,
		visualization: attributes.visualize,
		editable: !readback && attributes.visualize !== undefined,
		hidden: attributes.hidden ?? (readback && attributes.visualize !== undefined && attributes.label === undefined),
		pivot: attributes.transform === 'translate' ? attributes.pivot : undefined,
		transform: attributes.transform,
		object: attributes.object,
		options: attributes.options,
		default: readback && glslType === 'mat4' ? Array(16).fill(0) : structuredClone(attributes.default ?? declaration.initial) as TeachingValue,
		uniform: readback ? undefined : name,
		readback: readback ? name : undefined
	};
}

export function parseShaderControls(source: string): { controls: TeachingControl[]; errors: AnnotationError[] } {
	const controls: TeachingControl[] = [];
	const errors: AnnotationError[] = [];
	withGlslTree(source, tree => {
		for (const comment of tree.rootNode.descendantsOfType('comment')) {
			const found = comment && annotation(comment);
			if (!comment || !found) continue;
			const fail = (message: string) => errors.push({ line: comment.startPosition.row + 1, message: `${found.kind}: ${message}` });
			const variable = followingDeclaration(comment);
			const readback = found.kind === '@readback';
			if (!variable || variable.uniform === readback) {
				fail(readback ? 'has to stand directly above a local variable declaration.' : 'has to stand directly above a uniform declaration.');
				continue;
			}
			if (!(variable.type in DECLARATIONS) || (readback && !DECLARATIONS[variable.type as GlslType].readback)) {
				fail(`${variable.type} ${variable.name} cannot be shown.`);
				continue;
			}
			const glslType = variable.type as GlslType;
			let raw: unknown;
			try {
				raw = readAttributes(found.attributes);
			} catch (error) {
				fail(`write the attributes as { key: value, … }. ${(error as Error).message.split('\n')[0]}`);
				continue;
			}
			const schema = readback
				? z.strictObject(READBACK_ATTRIBUTES).partial()
				: z.strictObject({ ...CONTROL_ATTRIBUTES, default: DECLARATIONS[glslType].value }).partial();
			const parsed = schema.safeParse(raw);
			if (!parsed.success) {
				fail(issueMessage(parsed.error));
				continue;
			}
			const misplaced = Object.keys(parsed.data).find(key => ONLY_FOR[key as keyof typeof ONLY_FOR] && ONLY_FOR[key as keyof typeof ONLY_FOR] !== glslType);
			if (misplaced) {
				fail(`${misplaced} only works on a ${ONLY_FOR[misplaced as keyof typeof ONLY_FOR]}.`);
				continue;
			}
			if (controls.some(existing => existing.id === variable.name)) {
				fail(`${variable.name} already has an annotation.`);
				continue;
			}
			controls.push(control(found.kind, variable.name, glslType, parsed.data));
		}
	});
	return { controls, errors };
}

function fits(control: TeachingControl, value: TeachingValue | undefined) {
	switch (control.type) {
		case 'matrix4': return numbers(16).safeParse(value).success;
		case 'vector3':
		case 'color': return numbers(3).safeParse(value).success;
		case 'vector4': return numbers(4).safeParse(value).success;
		case 'checkbox': return typeof value === 'boolean';
		case 'slider': return typeof value === 'number';
		case 'options': return Number.isInteger(value) && (value as number) < (control.options?.length ?? 0);
	}
}

export function controlValues(
	controls: TeachingControl[],
	overrides: Record<string, TeachingValue>
): Record<string, TeachingValue> {
	return Object.fromEntries(controls.map(control => [
		control.id,
		fits(control, overrides[control.id]) ? overrides[control.id] : control.default
	]));
}
