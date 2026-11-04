import type { Tree } from 'web-tree-sitter';
import { withGlslTree } from '$lib/glsl/parser';
import { compileProgram, type Program, type UniformValue } from './gpu/program';

export type ShaderReadbackType = 'float' | 'vector3' | 'vector4' | 'matrix4';
export type ShaderReadbackValue = number | number[];
export type ShaderReadbackRequest = { id: string; variable: string; type: ShaderReadbackType };

const GLSL_TYPES: Record<ShaderReadbackType, string> = {
	float: 'float',
	vector3: 'vec3',
	vector4: 'vec4',
	matrix4: 'mat4'
};

const COMPONENTS: Record<ShaderReadbackType, number> = {
	float: 1,
	vector3: 3,
	vector4: 4,
	matrix4: 16
};

const DUMMY_FRAGMENT = 'out vec4 color; void main() { color = vec4(0.0); }';

function outputs(request: ShaderReadbackRequest, index: number) {
	return request.type === 'matrix4'
		? [0, 1, 2, 3].map(column => ({ name: `shaderlabReadback_${index}_${column}`, type: 'vec4', value: `${request.variable}[${column}]` }))
		: [{ name: `shaderlabReadback_${index}`, type: GLSL_TYPES[request.type], value: request.variable }];
}

function declarationEnd(tree: Tree, request: ShaderReadbackRequest) {
	const declaration = tree.rootNode.descendantsOfType('declaration').find(node => {
		const declarator = node?.childForFieldName('declarator');
		const name = declarator?.type === 'init_declarator' ? declarator.childForFieldName('declarator') : declarator;
		return node?.childForFieldName('type')?.text === GLSL_TYPES[request.type] && name?.text === request.variable && node.parent?.type === 'compound_statement';
	});
	return declaration?.endIndex;
}

function instrument(source: string, requests: ShaderReadbackRequest[]) {
	return withGlslTree(source, tree => {
		const firstFunction = tree.rootNode.namedChildren.find(node => node?.type === 'function_definition')?.startIndex;
		const ends = requests.map(request => declarationEnd(tree, request));
		if (firstFunction === undefined || ends.some(end => end === undefined)) return undefined;
		const insertions = requests.flatMap((request, index) => [
			{ at: firstFunction, text: outputs(request, index).map(output => `out ${output.type} ${output.name};\n`).join('') },
			{ at: ends[index]!, text: outputs(request, index).map(output => ` ${output.name} = ${output.value};`).join('') }
		]);
		return insertions.sort((a, b) => b.at - a.at)
			.reduce((result, { at, text }) => result.slice(0, at) + text + result.slice(at), source);
	});
}

class ReadbackProgram {
	readonly raw: Float32Array;
	readonly program: Program;
	readonly buffer: WebGLBuffer;
	readonly feedback: WebGLTransformFeedback;
	readonly vao: WebGLVertexArrayObject;

	constructor(private readonly gl: WebGL2RenderingContext, vertexSource: string, requests: ShaderReadbackRequest[]) {
		const instrumented = instrument(vertexSource, requests);
		if (!instrumented) throw new Error(`Shader readback variables ${requests.map(request => request.variable).join(', ')} were not found in the vertex shader.`);
		const feedbackVaryings = requests.flatMap((request, index) => outputs(request, index).map(output => output.name));
		const { program } = compileProgram(gl, instrumented, DUMMY_FRAGMENT, { feedbackVaryings });
		if (!program) throw new Error('The shader readback program did not compile.');
		this.program = program;
		this.buffer = gl.createBuffer()!;
		this.feedback = gl.createTransformFeedback()!;
		this.vao = gl.createVertexArray()!;
		this.raw = new Float32Array(requests.reduce((total, request) => total + COMPONENTS[request.type], 0));
		gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, this.buffer);
		gl.bufferData(gl.TRANSFORM_FEEDBACK_BUFFER, this.raw.byteLength, gl.DYNAMIC_COPY);
		gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, null);
	}

	setUniforms(values: Record<string, UniformValue>) {
		const identity: Partial<Record<number, number[]>> = {
			[this.gl.FLOAT_MAT3]: [1, 0, 0, 0, 1, 0, 0, 0, 1],
			[this.gl.FLOAT_MAT4]: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
		};
		for (const { name, type } of this.program.uniforms.values()) this.program.set(name, values[name] ?? identity[type]);
	}

	dispose() {
		this.gl.deleteTransformFeedback(this.feedback);
		this.gl.deleteBuffer(this.buffer);
		this.gl.deleteVertexArray(this.vao);
		this.program.dispose();
	}
}

type ReadbackInput = {
	vertexSource: string;
	requests: ShaderReadbackRequest[];
	uniformValues: Record<string, UniformValue>;
};

type PendingReadback = { input: ReadbackInput; program: ReadbackProgram; fence: WebGLSync };

export class ShaderReadback {
	private program?: ReadbackProgram;
	private programSource?: string;
	private programRequests?: ShaderReadbackRequest[];
	private pending?: PendingReadback;
	private queued?: ReadbackInput;

	constructor(
		private readonly gl: WebGL2RenderingContext,
		private readonly onValues: (values: Record<string, ShaderReadbackValue>) => void
	) {}

	get busy() {
		return this.pending !== undefined;
	}

	request(vertexSource: string, requests: ShaderReadbackRequest[], uniformValues: Record<string, UniformValue>) {
		const input = { vertexSource, requests, uniformValues };
		if (this.pending) {
			this.queued = input;
			return;
		}
		this.issue(input);
	}

	collect() {
		const pending = this.pending;
		if (!pending) return false;
		const gl = this.gl;
		if (gl.isContextLost()) {
			this.pending = undefined;
			this.queued = undefined;
			return false;
		}
		if (gl.getSyncParameter(pending.fence, gl.SYNC_STATUS) !== gl.SIGNALED) return true;
		gl.deleteSync(pending.fence);
		this.pending = undefined;
		gl.bindBuffer(gl.COPY_READ_BUFFER, pending.program.buffer);
		gl.getBufferSubData(gl.COPY_READ_BUFFER, 0, pending.program.raw);
		gl.bindBuffer(gl.COPY_READ_BUFFER, null);
		const queued = this.queued;
		this.queued = undefined;
		if (!queued || (queued.vertexSource === pending.input.vertexSource && queued.requests === pending.input.requests)) {
			this.onValues(decode(pending.input.requests, pending.program.raw));
		}
		if (queued) this.issue(queued);
		return this.pending !== undefined;
	}

	dispose() {
		if (this.pending) this.gl.deleteSync(this.pending.fence);
		this.pending = undefined;
		this.queued = undefined;
		this.program?.dispose();
		this.program = undefined;
		this.programSource = undefined;
		this.programRequests = undefined;
	}

	private issue(input: ReadbackInput) {
		const gl = this.gl;
		if (!input.requests.length || gl.isContextLost()) return;
		const program = this.programFor(input.vertexSource, input.requests);
		if (!program) return;
		try {
			program.setUniforms(input.uniformValues);
			program.program.bind();
			gl.bindVertexArray(program.vao);
			gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, program.feedback);
			gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, program.buffer);
			gl.enable(gl.RASTERIZER_DISCARD);
			gl.beginTransformFeedback(gl.POINTS);
			gl.drawArrays(gl.POINTS, 0, 1);
			gl.endTransformFeedback();
		} finally {
			gl.disable(gl.RASTERIZER_DISCARD);
			gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
			gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
			gl.bindVertexArray(null);
			gl.useProgram(null);
		}
		const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)!;
		gl.flush();
		this.pending = { input, program, fence };
	}

	private programFor(vertexSource: string, requests: ShaderReadbackRequest[]) {
		if (vertexSource === this.programSource && requests === this.programRequests) return this.program;
		this.program?.dispose();
		this.program = undefined;
		this.programSource = vertexSource;
		this.programRequests = requests;
		try {
			this.program = new ReadbackProgram(this.gl, vertexSource, requests);
		} catch (error) {
			console.warn(error);
		}
		return this.program;
	}
}

function decode(requests: ShaderReadbackRequest[], raw: Float32Array) {
	const values: Record<string, ShaderReadbackValue> = {};
	let offset = 0;
	for (const request of requests) {
		const size = COMPONENTS[request.type];
		values[request.id] = request.type === 'float' ? raw[offset] : Array.from(raw.subarray(offset, offset + size));
		offset += size;
	}
	return values;
}
